// Image uploads (#611): the avatar and the workspace logo, sent as a
// multipart form with one "file" part (PNG, JPG or WEBP, up to 5 MB).

/** `POST /api/onboarding/avatar` and `DELETE /api/onboarding/avatar`. */
export interface ImageUploadResponse {
  status: 'ok';
  /** `/uploads/avatars/…`, or "" once removed. */
  avatar_url: string;
}

/** `POST /api/onboarding/workspace/logo`; the workspace takes it with its next update. */
export interface LogoUploadResponse {
  status: 'ok';
  /** `/uploads/workspaces/…`. */
  logo_url: string;
}
