// Re-export from the cross-app shared module so the admin and portal stay
// in sync without a full workspace setup. Single source of truth lives in
// /shared/lib/athletes/validate.ts.
export {
  buildPatch,
  CV_MIME_ALLOW,
  CV_EXT_ALLOW,
  CV_MAX_BYTES,
  type AthleteFields,
} from '@shared/lib/athletes/validate';
