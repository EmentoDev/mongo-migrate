module.exports = {
	getConnection: getConnection
};

function getDbOpts(opts) {
	opts = opts || {
		host: 'localhost',
		db: 'my-app',
		port: 27017
	};
	opts.port = opts.port || 27017;
	return opts;
}

function getReplicaSetServers(opts, mongodb) {
	var replServers = opts.replicaSet.map(function (replicaSet) {
		var split = replicaSet.split(":");
		var host = split[0] || 'localhost';
		var port = parseInt(split[1]) || 27017;
		return new mongodb.Server(host, port);
	});
	return new mongodb.ReplSet(replServers);
}

function getMigrationsCollection(db, mongodb, cb) {
	// for mongodb 2.x
	if (typeof db.collection !== 'undefined') {
		return cb(db.collection('migrations'));
	}

	db.createCollection("migrations", function (err, res) {
		if (err) throw err;
		console.log("Migration collection created");
		return cb(db.collection('migrations'))
	});
}

function getConnection(opts, cb) {
	var mongodb = require('mongodb');

	if (opts.connectionString) {
		var MongoClient = mongodb.MongoClient;
		MongoClient.connect(opts.connectionString, opts.options, function (err, client) {
			if (err || !client) {
				return cb(err);
			}

			var db = client.db();

			console.log("Connected correctly to server - mongo driver:", JSON.stringify(client?.options?.metadata?.driver));

			getMigrationsCollection(db, mongodb, function (migrationCollection) {
				cb(null, {
					connection: db,
					migrationCollection: migrationCollection
				});
			});
		});
		return;
	}

	opts = getDbOpts(opts);
	var svr = null;

	//if replicaSet option is set then use a replicaSet connection
	if (opts.replicaSet) {
		svr = getReplicaSetServers(opts, mongodb);
	} else {
		//simple connection
		svr = new mongodb.Server(opts.host, opts.port, opts.server || {});
	}

	new mongodb.Db(opts.db, svr, { safe: true }).open(function (err, db) {
		if (err) {
			return cb(err);
		}

		var complete = function (authErr, res) {
			if (authErr) {
				return cb(authErr);
			}

			cb(null, {
				connection: db,
				migrationCollection: getMigrationsCollection(db, mongodb)
			});
		};

		if (opts.username) {
			db.authenticate(opts.username, opts.password, opts.authOptions || {}, complete);
		} else {
			complete(null, null);
		}
	});
}
