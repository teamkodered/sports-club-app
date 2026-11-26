"""
One-off fix (Nov 2026): CCTV clips already in R2 are H.265 labelled 'hev1', which
iPhones (every iPhone browser) refuse to play -- black screen. Apple needs 'hvc1'.
The label is 4 letters inside the file's index (the 'moov' box), which the sync
script already put at the START of every clip. So instead of re-downloading and
re-uploading ~1 GB per clip, this:
  1. downloads only the first few MB of the clip,
  2. swaps 'hev1' -> 'hvc1' inside the moov box (same length, nothing else moves),
  3. rebuilds the clip in R2 from that patched start + a server-side copy of the
     rest of the file (R2 multipart upload + UploadPartCopy) -- seconds per clip.
Video and audio data are untouched.

Run in the CCTV Synch folder (uses cctv_secrets.py, like the sync script):
    python cctv_fix_hvc1.py 1      <- TEST: fixes only the newest clip
    python cctv_fix_hvc1.py        <- all clips, newest first
Safe to stop (Ctrl+C) and run again: finished clips are listed in hvc1_fixed.txt
and skipped, and a clip that already says 'hvc1' is left alone.
"""
import os
import sys
import time
from datetime import datetime

import boto3
import requests
from botocore.config import Config

from cctv_secrets import R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET, SUPABASE_URL, SUPABASE_SERVICE_KEY

HEAD_BYTES = 8 * 1024 * 1024        # first part must be >= 5 MB for a multipart upload
MAX_HEAD_BYTES = 64 * 1024 * 1024    # give up if the index is bigger than this (shouldn't happen)
DONE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'hvc1_fixed.txt')


def log(*a):
    print(datetime.now().strftime('[%d/%m %H:%M:%S]'), *a, flush=True)


def find_moov(buf):
    """(offset, size) of the top-level 'moov' box within buf, or None."""
    o = 0
    while o + 8 <= len(buf):
        size = int.from_bytes(buf[o:o + 4], 'big')
        typ = buf[o + 4:o + 8]
        if size == 1:
            if o + 16 > len(buf):
                return None
            size = int.from_bytes(buf[o + 8:o + 16], 'big')
        if typ == b'moov':
            return o, size
        if size < 8:
            return None
        o += size
    return None


def patch_head(head):
    """Returns (status, new_head). status: 'patched' | 'already hvc1' | 'not hev1' |
    'no moov at start' | 'need more:<bytes>'. new_head is the same length as head."""
    m = find_moov(head)
    if not m:
        return 'no moov at start', None
    o, size = m
    if o + size > len(head):
        return f'need more:{o + size}', None
    moov = head[o:o + size]
    n = moov.count(b'hev1')
    if n == 0:
        return ('already hvc1' if b'hvc1' in moov else 'not hev1'), None
    return 'patched', head[:o] + moov.replace(b'hev1', b'hvc1') + head[o + size:]


s3 = boto3.client('s3', endpoint_url=R2_ENDPOINT, aws_access_key_id=R2_ACCESS_KEY_ID,
                  aws_secret_access_key=R2_SECRET_ACCESS_KEY, region_name='auto',
                  config=Config(retries={'max_attempts': 6, 'mode': 'standard'}))


def fix_clip(key):
    meta = s3.head_object(Bucket=R2_BUCKET, Key=key)
    total = meta['ContentLength']
    ctype = meta.get('ContentType') or 'video/mp4'
    n = min(HEAD_BYTES, total)
    while True:
        head = s3.get_object(Bucket=R2_BUCKET, Key=key, Range=f'bytes=0-{n - 1}')['Body'].read()
        status, new_head = patch_head(head)
        if status.startswith('need more:'):
            want = int(status.split(':')[1])
            if want > MAX_HEAD_BYTES or n >= total:
                return 'index too big (skipped)'
            n = min(total, ((want // (1024 * 1024)) + 1) * 1024 * 1024)
            continue
        break
    if status != 'patched':
        return status
    if n >= total:
        s3.put_object(Bucket=R2_BUCKET, Key=key, Body=new_head, ContentType=ctype)
    else:
        up = s3.create_multipart_upload(Bucket=R2_BUCKET, Key=key, ContentType=ctype)
        uid = up['UploadId']
        try:
            p1 = s3.upload_part(Bucket=R2_BUCKET, Key=key, PartNumber=1, UploadId=uid, Body=new_head)
            p2 = s3.upload_part_copy(Bucket=R2_BUCKET, Key=key, PartNumber=2, UploadId=uid,
                                     CopySource={'Bucket': R2_BUCKET, 'Key': key}, CopySourceRange=f'bytes={n}-{total - 1}')
            s3.complete_multipart_upload(Bucket=R2_BUCKET, Key=key, UploadId=uid, MultipartUpload={'Parts': [
                {'ETag': p1['ETag'], 'PartNumber': 1},
                {'ETag': p2['CopyPartResult']['ETag'], 'PartNumber': 2},
            ]})
        except Exception:
            try:
                s3.abort_multipart_upload(Bucket=R2_BUCKET, Key=key, UploadId=uid)
            except Exception:
                pass
            raise
    # check: same size, and the start now says hvc1
    after = s3.head_object(Bucket=R2_BUCKET, Key=key)['ContentLength']
    if after != total:
        return f'WARNING size changed {total} -> {after}'
    check = s3.get_object(Bucket=R2_BUCKET, Key=key, Range=f'bytes=0-{n - 1}')['Body'].read()
    st, _ = patch_head(check)
    return 'fixed' if st == 'already hvc1' else f'WARNING check says: {st}'


def all_clips():
    hdr = {'apikey': SUPABASE_SERVICE_KEY, 'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}'}
    out, offset = [], 0
    while True:
        r = requests.get(f'{SUPABASE_URL}/rest/v1/cctv_clips?select=storage_path,camera_name,recorded_at&order=recorded_at.desc&offset={offset}&limit=1000', headers=hdr, timeout=30)
        r.raise_for_status()
        rows = r.json()
        out += [x for x in rows if x.get('storage_path')]
        if len(rows) < 1000:
            return out
        offset += 1000


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else None
    done = set()
    if os.path.exists(DONE_FILE):
        with open(DONE_FILE, encoding='utf-8') as f:
            done = {l.strip() for l in f if l.strip()}
    clips = [c for c in all_clips() if c['storage_path'] not in done]
    log(f'{len(clips)} clip(s) to check{f" (test: first {limit})" if limit else ""}, {len(done)} already done')
    fixed = skipped = failed = 0
    for i, c in enumerate(clips[:limit] if limit else clips, 1):
        key = c['storage_path']
        try:
            res = fix_clip(key)
        except Exception as e:
            failed += 1
            log(f'{i}. {c.get("camera_name")} {c.get("recorded_at")}: ERROR {e} -- will retry next run')
            time.sleep(2)
            continue
        log(f'{i}. {c.get("camera_name")} {c.get("recorded_at")}: {res}')
        if res.startswith('WARNING'):
            failed += 1
            continue
        if res == 'fixed':
            fixed += 1
        else:
            skipped += 1
        with open(DONE_FILE, 'a', encoding='utf-8') as f:
            f.write(key + '\n')
    log(f'Finished: {fixed} fixed, {skipped} skipped (already fine / not H.265), {failed} to retry')


if __name__ == '__main__':
    main()
