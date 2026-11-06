// Uploading a file, as Linear's client does (decision 55): `fileUpload` hands out a signed link,
// the file's bytes are PUT to it, and the answer is where the file now is. The avatar or logo then
// takes that address through userUpdate or a workspace update.
import { ApiError } from './api';
import { graphql } from './graphql';

export type UploadPurpose = 'avatar' | 'workspace_logo';

type UploadFile = { upload_url: string; headers: Record<string, string> };

export async function uploadFile(file: File, purpose: UploadPurpose): Promise<string> {
  const { uploadFile: grant } = await graphql<{ uploadFile: UploadFile }>(
    'mutation FileUpload($input: JSON!) { fileUpload(input: $input) { success uploadFile } }',
    { input: { purpose, content_type: file.type, filename: file.name || 'image.png', size: file.size } },
  );
  const response = await fetch(grant.upload_url, { method: 'PUT', headers: grant.headers, body: file, credentials: 'omit' });
  const payload = (await response.json().catch(() => ({}))) as { asset_url?: string; detail?: unknown };
  if (!response.ok || !payload.asset_url) {
    throw new ApiError(response.status, typeof payload.detail === 'string' ? payload.detail : 'The file could not be uploaded');
  }
  return payload.asset_url;
}
