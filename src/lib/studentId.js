// Auto-generate student ID matching existing format
// Format: SURNAME(3 uppercase) + FIRSTNAME(3 uppercase) + DOB(YYYYMMDD)
// e.g. Achilles Matoso born 16 May 2021 = MATACH20210516

export function generateStudentId(firstName, lastName, dob) {
  const sur = (lastName || '').replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 3).padEnd(3, 'X')
  const fir = (firstName || '').replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 3).padEnd(3, 'X')
  const dobStr = dob ? dob.replace(/-/g, '') : '00000000'
  return `${sur}${fir}${dobStr}`
}

// Generate member ID e.g. PKA-001, KRBA-042
export function generateMemberId(discipline, index) {
  const prefix = discipline === 'KRBA' ? 'KRBA' : 'PKA'
  return `${prefix}-${String(index).padStart(3, '0')}`
}

// Get age category from DOB
export function getAgeCategory(dob) {
  if (!dob) return 'Unknown'
  const age = Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 60 * 60 * 1000))
  if (age < 8)  return 'Under 8'
  if (age <= 11) return '8-11'
  if (age <= 15) return '12-15'
  if (age <= 17) return '16-17'
  return '18+'
}
