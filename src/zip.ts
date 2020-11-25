import archiver from 'archiver';
import fs from 'fs-extra';
import path from 'path';

export interface Entry {
  file: string;
  name: string;
}

module.exports = async function (zipFile: string, entries: Entry[]) {
  await fs.mkdirp(path.dirname(zipFile));

  return new Promise((resolve, reject) => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const outStream = fs.createWriteStream(zipFile);
    const archive = archiver('zip', {
      zlib: { level: 9 } // Sets the compression level.
    });

    outStream.on('finish', resolve);

    // good practice to catch warnings (ie stat failures and other non-blocking errors)
    archive.on('warning', reject);
    archive.on('error', reject);

    for (const entry of entries) {
      archive.file(entry.file, { name: entry.name });
    }

    // pipe archive data to the file
    archive.pipe(outStream);

    archive.finalize();
  });
};
