# cloud-static

You have a folder of static files. You need to serve them, but your site is load-balanced or might be in the future... so you can't just use the local filesystem. `cloud-static` to the rescue.

```javascript
const cloudStatic = require('cloud-static')();

await cloudStatic.init({
  // A mongodb db object, already connected
  db: db,
  // An uploadfs object, already initialized
  uploadfs: uploadfs
});

await cloudStatic.syncFolder('/my/local/folder', '/my/uploadfs/path');

// Available on the web here

const baseUrl = cloudStatic.getUrl();

// Changes have been made... sync again to update files,
// and to orphan removed files

await cloudStatic.syncFolder('/my/local/folder', '/my/uploadfs/path');

// We're done with this stuff
await cloudStatic.removeFolder('/my/uploadfs/path');
```

`cloud-static` requires [uploadfs](https://npmjs.org/package/uploadfs) and [mongodb](https://npmjs.org/package/mongodb). `uploadfs` provides a cross-platform way to put files in cloud storage, and `mongodb` provides a way to remember metadata — such as what files you already have, so that they can be cleaned up later.

Using `mongodb` for metadata makes `cloud-static` faster and simpler than solutions that try to implement `readdir`, `stat` and friends separately for every cloud storage platform.
