import { getTokens, pickPhotos } from './google.ts';
import * as path from 'jsr:@std/path';
import { Throttler } from './utils.ts';

const outPath = 'output';

const files = [...Deno.readDirSync(outPath)]
  .filter((item) => item.isFile && item.name.endsWith('.jpg'))
  .map((item) => item.name);

const filesSet = new Set(files);

const { access } = await getTokens();
const photos = await pickPhotos(access);

console.log('Got', photos.length, 'photos');

// Download photos
const photosToDownload = photos.filter(
  (photo) => !filesSet.has(photo.id + '.jpg'),
);

let complete = 0;

console.log(photosToDownload.length, 'to download');

const throttler = new Throttler(10);

const results = await Promise.allSettled(
  photosToDownload.map((photo) =>
    throttler.task(async () => {
      const filePath = path.join(outPath, photo.id + '.jpg');
      const url = photo.baseUrl + '=d';

      try {
        const response = await fetch(url);
        const file = await Deno.open(filePath, {
          write: true,
          createNew: true,
        });

        await response.body!.pipeTo(file.writable);

        complete += 1;
        console.log('Downloaded', complete, 'of', photosToDownload.length);
      } catch (error) {
        console.log('Failed to download', url, error);
        await Deno.remove(filePath);
        throw error;
      }
    }),
  ),
);

const failures = results.filter((result) => result.status === 'rejected');

if (failures.length > 0) {
  console.log(failures.length, 'failures');
}

// Delete old photos
const expectedFiles = new Set(photos.map((photo) => photo.id + '.jpg'));
const toDelete = files.filter((file) => !expectedFiles.has(file));

if (toDelete.length) console.log('Deleting', toDelete.length);

await Promise.all(
  toDelete.map((file) => Deno.remove(path.join(outPath, file))),
);

console.log('Done!');
