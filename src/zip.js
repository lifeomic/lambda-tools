/* eslint-disable security/detect-non-literal-fs-filename */
const archiver = require('archiver');
const fs = require('fs-extra');
const path = require('path');

module.exports = async function (zipFile, entries) {
  await fs.mkdirp(path.dirname(zipFile));

  return new Promise((resolve, reject) => {
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
