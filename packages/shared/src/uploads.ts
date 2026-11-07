// Image uploads (decision 55): GraphQL's fileUpload grants a signed link, the
// browser PUTs the file's bytes there (PNG, JPG or WEBP, up to 5 MB), and the
// avatar or workspace logo takes the stored file with its next update.

/** `PUT /uploads/signed?token=…`: where the file is now. */
export interface SignedUploadResponse {
  /** `/uploads/avatars/…` or `/uploads/workspaces/…`. */
  asset_url: string;
}
