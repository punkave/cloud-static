const assert = require('assert');
const fs = require('fs');
const Promise = require('bluebird');
const request = require('request-promise');
const rimraf = require('rimraf');

let base = null;
let uploadfs = null;
let db = null;
let app = null;

describe('cloud-static', function() {

  after(function(done) {
    db.collection('cloudStatic').remove({}, function(err) {
      assert(!err);
      require('rimraf').sync(__dirname + '/public/test-uploadfs');
      require('rimraf').sync(__dirname + '/temp');
      done();
    });
  });

  it('should initialize uploadfs', function(done) {
    uploadfs = require('uploadfs')();
    return uploadfs.init({
      // We are testing here with the local uploadfs
      // backend, see the uploadfs module for complete tests
      // of the other backends
      backend: 'local',
      uploadsPath: __dirname + '/public/test-uploadfs',
      uploadsUrl: 'http://localhost:7901/test-uploadfs'
    }, function(err) {
      if (err) {
        console.error(err);
        assert(false);
      }
      done();
    });
  });

  it('should initialize mongodb', function(done) {
    require('mongodb').MongoClient.connect('mongodb://localhost:27017', function(err, client) {
      assert(!err);
      db = client.db('cloud-static-test');
      done();
    });
  });

  it('should initialize express server for serve testing', function() {
    app = require('express')();
    if (!fs.existsSync(__dirname + '/public')) {
      fs.mkdirSync(__dirname + '/public');
    }
    app.use(require('express-static')(__dirname + '/public'));
    app.listen(7901);
  });

  it('should initialize cloud-static', function() {
    cloudStatic = require('../index.js')();
    return cloudStatic.init({
      db: db,
      uploadfs: uploadfs
    });
  });

  it('should accept sync up of a folder', function() {
    fs.mkdirSync(__dirname + '/temp');
    base = __dirname + '/temp/cloud-static-test';
    fs.mkdirSync(base);
    fs.writeFileSync(base + '/hello.txt', 'hello');
    fs.writeFileSync(base + '/goodbye.txt', 'goodbye');
    fs.mkdirSync(base + '/subdir');
    fs.writeFileSync(base + '/subdir/nested.txt', 'nested');
    return cloudStatic.syncFolder(base, '/cloud-static-test');
  });

  it('should have the expected files after sync up', function() {
    const baseUrl = cloudStatic.getUrl('/cloud-static-test');
    return request(baseUrl + '/hello.txt').then(function(data) {
      assert(data === 'hello');
    }).then(function() {
      return request(baseUrl + '/goodbye.txt').then(function(data) {
        assert(data === 'goodbye');
      });
    }).then(function() {
      return request(baseUrl + '/subdir/nested.txt').then(function(data) {
        assert(data === 'nested');
      });
    });
  });

  it('should accept update of a folder', function() {
    base = __dirname + '/temp/cloud-static-test';
    fs.unlinkSync(base + '/goodbye.txt');
    fs.writeFileSync(base + '/hello.txt', 'hello2');
    return cloudStatic.syncFolder(base, '/cloud-static-test');
  });

  it('should have the expected files, and only those, after update', function() {
    const baseUrl = cloudStatic.getUrl('/cloud-static-test');
    return request(baseUrl + '/hello.txt').then(function(data) {
      assert(data === 'hello2');
    }).then(function() {
      return request(baseUrl + '/goodbye.txt').then(function(data) {
        assert(false);
      }).catch(function() {
        assert(true);
      });
    }).then(function() {
      return request(baseUrl + '/subdir/nested.txt').then(function(data) {
        assert(data === 'nested');
      });
    });
  });

  it('should remove the folder contents without error', function() {
    return cloudStatic.removeFolder('/cloud-static-test');
  });

  it('folder contents should be gone now', function() {
    const baseUrl = cloudStatic.getUrl('/cloud-static-test');
    return Promise.try(function() {
      request(baseUrl + '/hello.txt').then(function(data) {
        assert(false);
      }).catch(function() {
        assert(true);
      });
    }).then(function() {
      request(baseUrl + '/goodbye.txt').then(function(data) {
        assert(false);
      }).catch(function() {
        assert(true);
      });
    }).then(function() {
      request(baseUrl + '/subdir/nested.txt').then(function(data) {
        assert(false);
      }).catch(function() {
        assert(true);
      });
    });
  });

});
