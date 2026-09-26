package uk.org.derbykickboxing.klasschamp

import android.content.Intent
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.Period
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

/**
 * Reads the athlete's data from Android Health Connect -- the hub that
 * Samsung Health, Google Fit / Fitbit, Garmin, Oura, etc. sync into -- and
 * hands it to the web app as plain JSON. The web app then POSTs it to the
 * wearable-ingest edge function, so this plugin never talks to the server.
 *
 * JS side: window.Capacitor.Plugins.HealthConnect
 *   isAvailable()            -> { available, status }
 *   hasPermissions()         -> { granted }
 *   requestPermissions()     -> { granted }
 *   readSummary({ days })    -> { days: [...], workouts: [...] }  (same shape wearable-ingest expects)
 */
@CapacitorPlugin(name = "HealthConnect")
class HealthConnectPlugin : Plugin() {

    private val permissions = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HealthPermission.getReadPermission(RestingHeartRateRecord::class),
        HealthPermission.getReadPermission(HeartRateVariabilityRmssdRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(DistanceRecord::class),
    )

    private val scope = CoroutineScope(Dispatchers.IO)
    private val dayFmt = DateTimeFormatter.ISO_LOCAL_DATE

    private fun client(): HealthConnectClient = HealthConnectClient.getOrCreate(context)

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val status = HealthConnectClient.getSdkStatus(context)
        val ret = JSObject()
        ret.put("available", status == HealthConnectClient.SDK_AVAILABLE)
        ret.put("status", when (status) {
            HealthConnectClient.SDK_AVAILABLE -> "available"
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "update_required"
            else -> "unavailable"
        })
        call.resolve(ret)
    }

    @PluginMethod
    fun hasPermissions(call: PluginCall) {
        scope.launch {
            try {
                val granted = client().permissionController.getGrantedPermissions()
                call.resolve(JSObject().put("granted", granted.containsAll(permissions)))
            } catch (e: Exception) {
                call.reject("Health Connect not available: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun requestPermissions(call: PluginCall) {
        try {
            val contract = PermissionController.createRequestPermissionResultContract()
            val intent: Intent = contract.createIntent(context, permissions)
            startActivityForResult(call, intent, "onPermissionsResult")
        } catch (e: Exception) {
            call.reject("Could not open Health Connect permissions: ${e.message}")
        }
    }

    @ActivityCallback
    private fun onPermissionsResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        scope.launch {
            try {
                val granted = client().permissionController.getGrantedPermissions()
                call.resolve(JSObject().put("granted", granted.containsAll(permissions)))
            } catch (e: Exception) {
                call.reject("Could not read permissions: ${e.message}")
            }
        }
    }

    /** Daily totals + workouts for the last N days, in the wearable-ingest JSON shape. */
    @PluginMethod
    fun readSummary(call: PluginCall) {
        val days = call.getInt("days") ?: 14
        scope.launch {
            try {
                val hc = client()
                val zone = ZoneId.systemDefault()
                val today = LocalDate.now(zone)
                val start = today.minusDays(days.toLong() - 1).atStartOfDay(zone)
                val end = ZonedDateTime.now(zone)
                val startI = start.toInstant()
                val endI = end.toInstant()

                // Per-day buckets
                val byDay = LinkedHashMap<String, JSObject>()
                fun day(d: LocalDate): JSObject = byDay.getOrPut(d.format(dayFmt)) { JSObject().put("day", d.format(dayFmt)) }

                // Steps / active calories / distance: aggregated per day
                val daily = hc.aggregateGroupByPeriod(
                    AggregateGroupByPeriodRequest(
                        metrics = setOf(StepsRecord.COUNT_TOTAL, ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL, DistanceRecord.DISTANCE_TOTAL),
                        timeRangeFilter = TimeRangeFilter.between(start.toLocalDateTime(), end.toLocalDateTime()),
                        timeRangeSlicer = Period.ofDays(1),
                    )
                )
                for (bucket in daily) {
                    val d = day(bucket.startTime.toLocalDate())
                    bucket.result[StepsRecord.COUNT_TOTAL]?.let { d.put("steps", it) }
                    bucket.result[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.let { d.put("active_calories", it.inKilocalories) }
                    bucket.result[DistanceRecord.DISTANCE_TOTAL]?.let { d.put("distance_m", it.inMeters) }
                }

                // Sleep: each session counts towards the day it ended
                val sleeps = hc.readRecords(ReadRecordsRequest(SleepSessionRecord::class, TimeRangeFilter.between(startI, endI))).records
                val sleepSecs = HashMap<String, Long>()
                for (s in sleeps) {
                    val key = s.endTime.atZone(zone).toLocalDate().format(dayFmt)
                    sleepSecs[key] = (sleepSecs[key] ?: 0L) + (s.endTime.epochSecond - s.startTime.epochSecond)
                }
                for ((k, v) in sleepSecs) day(LocalDate.parse(k)).put("sleep_seconds", v)

                // Resting HR and HRV: latest reading per day
                val rhr = hc.readRecords(ReadRecordsRequest(RestingHeartRateRecord::class, TimeRangeFilter.between(startI, endI))).records
                for (r in rhr) day(r.time.atZone(zone).toLocalDate()).put("resting_heart_rate", r.beatsPerMinute)
                val hrv = hc.readRecords(ReadRecordsRequest(HeartRateVariabilityRmssdRecord::class, TimeRangeFilter.between(startI, endI))).records
                for (r in hrv) day(r.time.atZone(zone).toLocalDate()).put("hrv", r.heartRateVariabilityMillis)

                // Workouts, with avg/max heart rate aggregated over each session
                val workouts = JSArray()
                val sessions = hc.readRecords(ReadRecordsRequest(ExerciseSessionRecord::class, TimeRangeFilter.between(startI, endI))).records
                for (s in sessions) {
                    val w = JSObject()
                    w.put("id", s.metadata.id)
                    w.put("sport_name", s.title ?: exerciseName(s.exerciseType))
                    w.put("start_time", s.startTime.toString())
                    w.put("end_time", s.endTime.toString())
                    w.put("duration_seconds", s.endTime.epochSecond - s.startTime.epochSecond)
                    w.put("source", s.metadata.dataOrigin.packageName)
                    try {
                        val agg = hc.aggregate(
                            AggregateRequest(
                                metrics = setOf(HeartRateRecord.BPM_AVG, HeartRateRecord.BPM_MAX, ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL, DistanceRecord.DISTANCE_TOTAL),
                                timeRangeFilter = TimeRangeFilter.between(s.startTime, s.endTime),
                            )
                        )
                        agg[HeartRateRecord.BPM_AVG]?.let { w.put("avg_heart_rate", it) }
                        agg[HeartRateRecord.BPM_MAX]?.let { w.put("max_heart_rate", it) }
                        agg[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.let { w.put("calories", it.inKilocalories) }
                        agg[DistanceRecord.DISTANCE_TOTAL]?.let { w.put("distance_m", it.inMeters) }
                    } catch (_: Exception) { /* no HR data for this session */ }
                    workouts.put(w)
                }

                val daysArr = JSArray()
                for (d in byDay.values) daysArr.put(d)
                call.resolve(JSObject().put("days", daysArr).put("workouts", workouts))
            } catch (e: Exception) {
                call.reject("Could not read Health Connect data: ${e.message}")
            }
        }
    }

    private fun exerciseName(type: Int): String = when (type) {
        ExerciseSessionRecord.EXERCISE_TYPE_BOXING -> "Boxing"
        ExerciseSessionRecord.EXERCISE_TYPE_MARTIAL_ARTS -> "Martial Arts"
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING -> "Running"
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL -> "Treadmill"
        ExerciseSessionRecord.EXERCISE_TYPE_WALKING -> "Walking"
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING -> "Cycling"
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY -> "Indoor Cycling"
        ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING -> "Strength Training"
        ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING -> "Weightlifting"
        ExerciseSessionRecord.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING -> "HIIT"
        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL -> "Swimming"
        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER -> "Open Water Swimming"
        ExerciseSessionRecord.EXERCISE_TYPE_ROWING -> "Rowing"
        ExerciseSessionRecord.EXERCISE_TYPE_ROWING_MACHINE -> "Rowing Machine"
        ExerciseSessionRecord.EXERCISE_TYPE_YOGA -> "Yoga"
        ExerciseSessionRecord.EXERCISE_TYPE_STRETCHING -> "Stretching"
        ExerciseSessionRecord.EXERCISE_TYPE_ELLIPTICAL -> "Elliptical"
        ExerciseSessionRecord.EXERCISE_TYPE_HIKING -> "Hiking"
        ExerciseSessionRecord.EXERCISE_TYPE_FOOTBALL_AMERICAN, ExerciseSessionRecord.EXERCISE_TYPE_FOOTBALL_AUSTRALIAN -> "Football"
        ExerciseSessionRecord.EXERCISE_TYPE_SOCCER -> "Football"
        ExerciseSessionRecord.EXERCISE_TYPE_BASKETBALL -> "Basketball"
        ExerciseSessionRecord.EXERCISE_TYPE_CALISTHENICS -> "Calisthenics"
        ExerciseSessionRecord.EXERCISE_TYPE_EXERCISE_CLASS -> "Exercise Class"
        ExerciseSessionRecord.EXERCISE_TYPE_OTHER_WORKOUT -> "Workout"
        else -> "Workout"
    }
}
