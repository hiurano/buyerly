import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { SignedUploadResponse } from '@buyerly/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { rateLimit } from '../http/rate-limit.ts';
import { HttpError } from '../http/errors.ts';
import { ImageStorage, InvalidImageUpload } from '../uploads/images.ts';
import { SIGNED_UPLOAD_PATH, verifyUpload } from '../uploads/signed.ts';

// The files under /uploads/ (api/server.py mounted them) and the byte upload
// to a signed link that GraphQL's fileUpload hands out (decision 55). Avatars
// and logos are attached by userUpdate and the workspace update.

// The Python API's cap on an upload request (api/server.py): 6 MB, for a
// 5 MB image and the form around it.
export const UPLOAD_REQUEST_LIMIT = 6 * 1024 * 1024;
const TOO_LARGE = 'The request body exceeds the allowed size limit.';

async function stored<T>(save: () => Promise<T>): Promise<T> {
  try {
    return await save();
  } catch (error) {
    if (error instanceof InvalidImageUpload) throw new HttpError(400, error.message);
    throw error;
  }
}

export async function uploadRoutes(app: FastifyInstance): Promise<void> {
  const images = new ImageStorage(app.config.uploadsRoot);
  await mkdir(join(images.root, 'avatars'), { recursive: true });
  await mkdir(join(images.root, 'workspaces'), { recursive: true });

  // Uploads get a new name on every change, so browsers may keep them.
  // Anything but a file (a directory, a dotfile, a path out of the
  // directory) is "Not Found", as Starlette's StaticFiles answers.
  await app.register(async (files) => {
    files.setErrorHandler(async (error: { statusCode?: number }, request, reply) => {
      if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
        reply.code(404);
        return { detail: 'Not Found' };
      }
      request.log.error({ err: error }, 'Request failed');
      reply.code(500);
      return { detail: 'Internal Server Error' };
    });
    await files.register(fastifyStatic, {
      root: images.root,
      prefix: '/uploads/',
      decorateReply: false,
      index: false,
      list: false,
      redirect: false,
      // Half-written files (".upload-…") are never served.
      dotfiles: 'deny',
      cacheControl: true,
      maxAge: 365 * 24 * 60 * 60 * 1000,
      immutable: true,
    });
  });

  // Refused before the body is read, as the Python API's middleware did.
  const refuseTooLarge = async (request: FastifyRequest) => {
    const length = Number(request.headers['content-length']);
    if (Number.isFinite(length) && length > UPLOAD_REQUEST_LIMIT) throw new HttpError(413, TOO_LARGE);
  };

  // The bytes of a file `fileUpload` granted (graphql/areas/uploads), PUT to
  // its signed link (decision 55). The link is the grant: no session is
  // needed. The answer is where the file is now; the avatar or logo takes it
  // with the next userUpdate or workspace update, which check it is the
  // user's own. Logos nobody took for a day are removed first.
  await app.register(async (signed) => {
    signed.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit: UPLOAD_REQUEST_LIMIT }, (_request, body, done) => done(null, body));
    signed.put<{ Querystring: { token?: string } }>(
      SIGNED_UPLOAD_PATH,
      {
        bodyLimit: UPLOAD_REQUEST_LIMIT,
        onRequest: refuseTooLarge,
        preValidation: [rateLimit({ limit: 20, scope: 'signed_upload' })],
      },
      async (request): Promise<SignedUploadResponse> => {
        const grant = verifyUpload(app.config.otpPepper, String(request.query.token ?? ''));
        if (!grant) throw new HttpError(403, 'This upload link is invalid or has expired');
        const content = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
        const category = grant.p === 'avatar' ? 'avatars' : 'workspaces';
        if (category === 'workspaces') await app.db.transaction((tx) => images.cleanupStaleWorkspaceLogos(tx));
        const assetUrl = await stored(() =>
          images.save(content, { filename: grant.n, contentType: grant.t || null, category, ownerUserId: grant.u }),
        );
        return { asset_url: assetUrl };
      },
    );
  });
}
