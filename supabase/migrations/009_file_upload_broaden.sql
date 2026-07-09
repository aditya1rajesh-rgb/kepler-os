-- 009_file_upload_broaden
--
-- Two fixes for Brand Intelligence file uploads:
--
-- 1) Allow the 'unsupported' file status. fileService marks files it cannot
--    parse client-side (e.g. PDF, docx) as 'unsupported' but still stores them
--    as intelligence sources. The prior CHECK constraint only permitted
--    ('pending','processing','ready','failed'), so every PDF upload violated the
--    constraint and the workspace_files insert failed with a generic
--    "Upload failed." This was the root cause of PDF uploads failing.
--
-- 2) Broaden the workspace-files storage bucket allowed_mime_types to cover the
--    common business document + image formats the upload UI advertises, so
--    .docx/.md/.json/.html/.xlsx/.pptx/images are accepted, not just the
--    original six types.

ALTER TABLE public.workspace_files
    DROP CONSTRAINT IF EXISTS workspace_files_status_valid;

ALTER TABLE public.workspace_files
    ADD CONSTRAINT workspace_files_status_valid
    CHECK (status IN ('pending', 'processing', 'ready', 'failed', 'unsupported'));

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json',
    'text/html',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/svg+xml'
]::text[]
WHERE id = 'workspace-files';
