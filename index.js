const Promise = require('bluebird');
const async = require('async');
const _ = require('lodash');
const regExpQuote = require('regexp-quote');
const fs = require('fs');

// Efficiently sync a local folder of static files to uploadfs,
// with the ability to remove the folder and its contents later.
// This ensures your application will still work if you move
// it to s3, azure blob storage, etc. via uploadfs.
//
// It is meant for delivering the output of tools like backstop,
// sitemap generators, etc. that generate output as HTML files
// and associated assets.
//
// As long as you use this module, you won't have to worry about
// making changes to those tools on the day you switch to S3.

module.exports = () => {
  let options = null;

  const self = {
    // options.db (a mongodb database object) and options.uploadfs (an
    // instance of uploadfs) are required. If no callback is passed, a promise
    // is returned. You must await that promise before invoking other methods.
    init: (options, callback) => {
      if (!options.db) {
        throw new Error('db argument not given, mongodb connection object must be supplied');
      }
      if (!options.uploadfs) {
        throw new Error('uploadfs option not given, uploadfs instance must be supplied');
      }
      self.uploadfs = options.uploadfs;
      if (!callback) {
        return Promise.promisify(body)();
      } else {
        return body(callback);
      }
      function body(callback) {
        return options.db.collection(options.collectionName || 'cloudStatic', function(err, collection) {
          self.db = collection;
          return callback(err);
        });
      }
    },

    // Sync files from localFolder (on disk) to uploadfsPath (in uploadfs).
    // The url(uploadfsPath) method may then be used to get a URL at which
    // the folder can be viewed as if it were served as a static site, even
    // though the site may be in the cloud, as long as uploadfs has been
    // properly configured. Note that your cloud storage might or might not
    // be configured to automatically serve `index.html` if that is not
    // present in the URL.
    //
    // Existing files at or below uploadfsPath that do not exist in localFolder
    // are REMOVED.
    //
    // If a file has not been modified since its last sync
    // according to the filesystem, it MAY not be copied again, for
    // performance reasons.
    //
    // This method is NOT guaranteed to clean up old content properly unless the previously
    // uploaded content was also uploaded with this method.
    //
    // If no callback is passed, a promise is returned.

    syncFolder: function(localFolder, uploadfsPath, callback) {
      let files = null;
      if (!callback) {
        return Promise.promisify(body)();
      } else {
        return body(callback);
      }
      function body(callback) {
        return async.series([
          sync,
          cleanup
        ], callback);
        function sync(callback) {
          return syncToUploadfs(localFolder, uploadfsPath, (err, copies) => {
            if (err) {
              return callback(err);
            }
            files = copies.map(copy => {
              return {
                _id: copy.to
              };
            });
            return async.eachLimit(files, 5, (file, callback) => {
              return self.db.update(file, file, { upsert: true }, callback);
            }, callback);
          });
        }
        function cleanup(callback) {
          return self.removeFolder(uploadfsPath, _.map(files, '_id'), callback);
        }
      }

      function syncToUploadfs(from, to, callback) {
        var copies = [];
  
        copies = enumerateCopies(from, to);
  
        return performCopies(function(err) {
          if (err) {
            return callback(err);
          }
          return callback(null, copies);
        });
  
        function performCopies(callback) {
          return async.eachLimit(copies, 5, function(copy, callback) {
            return self.uploadfs.copyIn(copy.from, copy.to, function(err) {
              return callback(err);
            });
          }, callback);
        }
  
      };
    
      function enumerateCopies(from, to) {
  
        var copies = [];
        enumerateDir(from, to);
        return copies;
  
        function enumerateDir(from, to) {
          var files = fs.readdirSync(from);
          _.each(files, function(file) {
            var fromFile = from + '/' + file;
            var toFile = to + '/' + file;
            var stat = fs.statSync(fromFile);
            if (stat.isDirectory()) {
              enumerateDir(fromFile, toFile);
            } else {
              enumerateFile(fromFile, toFile);
            }
          });
        }
  
        function enumerateFile(fromFile, toFile) {
          copies.push({
            from: fromFile,
            to: toFile
          });
        }
      };
    },

    // Recursively removes the contents of a folder previously synced up to the web
    // with the `syncFolder` method. Any files whose uploadfs paths are in the `except`
    // array are not removed. The `except` parameter may be completely omitted.
    //
    // This method is NOT guaranteed to work unless the folder was
    // originally synced up using `syncFolder`.
    //
    // If no callback is passed, a promise is returned.

    removeFolder: (uploadfsPath, except, callback) => {
      if (!Array.isArray(except)) {
        callback = except;
        except = [];
      }
      if (!callback) {
        return Promise.promisify(body)();
      } else {
        return body(callback);
      }

      function body(callback) {
        return self.db.find({
          $and: [
            {
              _id: new RegExp('^' + regExpQuote(uploadfsPath + '/'))
            }, {
              _id: { $nin: except }
            }
          ]
        }).toArray(function(err, files) {
          if (err) {
            return callback(err);
          }
          return async.eachLimit(files, 5, (file, callback) => {
            return async.series([
              fromUploadfs,
              fromDb
            ], callback);
            function fromUploadfs(callback) {
              return self.uploadfs.remove(file._id, function(err) {
                if (err) {
                  console.warn('File most likely already gone from uploadfs: ' + file._id);
                }
                return callback(null);
              });
            }
            function fromDb(callback) {
              return self.db.remove({ _id: file._id }, callback);
            }
          }, callback);
        });
      }
    },

    // Returns the public URL corresponding to an uploadfs path. Provided for
    // convenience.

    getUrl: (uploadfsPath) => {
      return self.uploadfs.getUrl() + uploadfsPath;
    }
  };

  return self;
  
};
