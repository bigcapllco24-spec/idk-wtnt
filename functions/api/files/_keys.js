import { HttpError } from '../../_lib.js';

const ALLOWED = {
  track: /^audio\//, video: /^video\//,
  photo: /^image\//, art: /^image\//,
  tee: /^(image\/|model\/gltf-binary|application\/octet-stream)/,
  project: /^(application\/zip|application\/x-zip|application\/x-zip-compressed|application\/octet-stream|text\/html)/,
};

export function checkKind(type, role, contentType) {
  const rule = role === 'cover' ? /^image\// : ALLOWED[type];
  if (!rule.test(contentType)) {
    throw new HttpError(400, role === 'cover' ? 'The cover has to be an image.' : `That file (${contentType}) doesn't match "${type}".`);
  }
}

export function safeName(name) {
  return (name || 'file').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').slice(-80);
}

export function newKey(type, name, role = 'file') {
  return `${type}/${crypto.randomUUID()}/${role === 'cover' ? 'cover-' : ''}${safeName(name)}`;
}

export function checkKey(key) {
  if (typeof key !== 'string' || !/^[a-z]+\/[0-9a-f-]{36}\/[a-z0-9._-]+$/.test(key)) throw new HttpError(400, 'Bad file key.');
  return key;
}
