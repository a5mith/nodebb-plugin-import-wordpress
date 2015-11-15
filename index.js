
var async = require('async');
var mysql = require('mysql');
var moment = require('moment');
var _ = require('underscore');
var noop = function(){};

var logPrefix = '[nodebb-plugin-import-wordpress]';
var WPShortcode = require('./wp.shortcode').shortcode;

(function(Exporter) {

    Exporter.setup = function(config, callback) {
        Exporter.log('setup');

        // mysql db only config
        // extract them from the configs passed by the nodebb-plugin-import adapter
        var _config = {
            host: config.dbhost || config.host || 'localhost',
            user: config.dbuser || config.user || 'root',
            password: config.dbpass || config.pass || config.password || '',
            port: config.dbport || config.port || 3306,
            database: config.dbname || config.name || config.database || 'wordpress'
        };

        Exporter.config(_config);
        Exporter.config('prefix', config.prefix || config.tablePrefix || '');

        if (config.custom && typeof config.custom === 'string') {
            try {
                config.custom = JSON.parse(config.custom)
            } catch (e) {
                config.custom = null
            }
        }

        Exporter.config('custom', config.custom || {
            galleryShortcodes: 'toHTML',

            // bbpress used 2.5.4
            bbpress: false
        });

        Exporter.connection = mysql.createConnection(_config);
        Exporter.connection.connect();

        callback(null, Exporter.config());
    };

    Exporter.getUsers = function(callback) {
        return Exporter.getPaginatedUsers(0, -1, callback);
    };
    Exporter.getPaginatedUsers = function(start, limit, callback) {
        callback = !_.isFunction(callback) ? noop : callback;
        var prefix = Exporter.config('prefix');
        var startms = +new Date();
        var query = 'SELECT '
            + prefix + 'users.ID as _uid, '
            + prefix + 'users.user_nicename as _username, '
            + prefix + 'users.user_login as _alternativeUsername, '

            + prefix + 'users.user_pass as _hashed_password, '
            // passwords import not supported yet, but let's save the MD5 password anyways
            // https://github.com/akhoury/nodebb-plugin-import/issues/64

            + prefix + 'users.user_email as _registrationEmail, '
            + prefix + 'users.user_email as _email, '
            + prefix + 'users.user_registered as _joindate, '
            + prefix + 'users.user_url as _website, '

            + prefix + 'capabilities.meta_value as _wp_capabilities, '
            + 'last_activity.meta_value as _lastonline, '
            + 'description.meta_value as _signature '

            + 'FROM ' + prefix + 'users '

            + 'LEFT JOIN ' + prefix + 'usermeta AS wp_capabilities ON wp_capabilities.user_id=' + prefix + 'users.ID AND wp_capabilities.meta_key="wp_capabilities" '
            + 'LEFT JOIN ' + prefix + 'usermeta AS last_activity ON last_activity.user_id=' + prefix + 'users.ID AND last_activity.meta_key="last_activity" '
            + 'LEFT JOIN ' + prefix + 'usermeta AS description ON description.user_id=' + prefix + 'users.ID AND description.meta_key="description" '


            + (start >= 0 && limit >= 0 ? ' LIMIT ' + start + ',' + limit : '');

        Exporter.query(query,
            function(err, rows) {
                if (err) {
                    Exporter.error(err);
                    return callback(err);
                }
                //normalize here
                var map = {};
                rows.forEach(function(row) {
                    row._signature = row._signature || '';

                    // from ISO date to timestamp (ms)
                    row._joindate = row._joindate ? moment(row._joindate).unix() * 1000 : startms;
                    row._lastonline = row._lastonline ? moment(row._lastonline).unix() * 1000 : undefined;

                    // lower case the email for consistency
                    row._email = (row._email || '').toLowerCase();

                    row._level = (row._wp_capabilities || '').indexOf('s:13:"administrator";b:1') !== -1 ? 'administrator' : 'member';

                    // I don't know about you about I noticed a lot my users have incomplete urls, urls like: http://
                    row._picture = Exporter.validateUrl(row._picture);
                    row._website = Exporter.validateUrl(row._website);

                    map[row._uid] = row;
                });

                callback(null, map);
            });
    };

    Exporter.getCategories = function(callback) {
        return Exporter.getPaginatedCategories(0, -1, callback);
    };
    Exporter.getPaginatedCategories = function(start, limit, callback) {
        callback = !_.isFunction(callback) ? noop : callback;

        var prefix = Exporter.config('prefix');
        var custom = Exporter.config('custom');
        var startms = +new Date();

        var query = 'SELECT ';
        if (custom && custom.bbpress) {
            // if bbpress
            query += ''
            + prefix + 'posts.ID as _cid, '
            + prefix + 'posts.post_title as _name, '
            + prefix + 'posts.post_name as _slug, '
            + prefix + 'posts.post_content as _description, '
            + prefix + 'posts.menu_order as _order, '
            + prefix + 'posts.post_date as _timestamp, '
            + prefix + 'posts.post_status as _wp_status, '
            + prefix + 'posts.post_parent as _parentCid '
            + 'FROM ' + prefix + 'posts '
            + 'WHERE ' + prefix + 'posts.post_type="forum" '
        } else {
            // if core wp
            query += ''
                + prefix + 'terms.term_id as _cid, '
                + prefix + 'terms.name as _name, '
                + prefix + 'terms.slug as _slug, '
                + prefix + 'term_taxonomy.description as _description, '
                + prefix + 'term_taxonomy.parent as _parentCid '
                + 'FROM ' + prefix + 'terms '
                + 'LEFT JOIN ' + prefix + 'term_taxonomy ON ' + prefix + 'term_taxonomy.term_id=' + prefix + 'terms.term_id '
                + 'WHERE ' + prefix + 'term_taxonomy.taxonomy="category" ';
        }
        query += (start >= 0 && limit >= 0 ? 'LIMIT ' + start + ',' + limit : '');

        Exporter.query(query,
            function(err, rows) {
                if (err) {
                    Exporter.error(err);
                    return callback(err);
                }
                var map = {};
                rows.forEach(function(row, i) {
                    row._name = row._name || ('Category ' + (i + 1));
                    row._description = row._description || 'No description available';
                    row._disabled = row._wp_status === "private" || row._wp_status === "hidden" ? 1 : 0 ;
                    row._timestamp = row._timestamp ? moment(row._timestamp).unix() * 1000 : startms;
                    map[row._cid] = row;
                });
                callback(null, map);
            });
    };



    //todo : combine the getTags query with the getTopics?
    // I don't know how to do, need mysql guru
    // http://wordpress.stackexchange.com/questions/169863/wordpress-custom-sql-query-get-all-posts-with-category-id-and-a-concated-list

    var getTags = function(callback) {
        return getPaginatedTags(0, -1, callback);
    };
    var getPaginatedTags = function(start, limit, callback) {
        callback = !_.isFunction(callback) ? noop : callback;

        var prefix = Exporter.config('prefix');

        var query = 'SELECT '
            + prefix + 'terms.term_id as _tag_id, '
            + prefix + 'terms.name as _name, '
            + prefix + 'terms.slug as _slug, '
            + prefix + 'term_relationships.object_id as _tid '

            + 'FROM ' + prefix + 'terms '

            + 'LEFT JOIN ' + prefix + 'term_relationships '
            + 'ON ' + prefix + 'terms.term_id = ' + prefix + 'term_relationships.term_taxonomy_id '

            + 'LEFT JOIN ' + prefix + 'term_taxonomy '
            + 'ON ' + prefix + 'term_relationships.term_taxonomy_id = ' + prefix + 'term_taxonomy.term_taxonomy_id '

            + 'WHERE ' + prefix + 'term_taxonomy.count > 0 '
            + 'AND (' + prefix + 'term_taxonomy.taxonomy = "post_tag"  OR ' + prefix + 'term_taxonomy.taxonomy = "topic-tag") '
            + (start >= 0 && limit >= 0 ? 'LIMIT ' + start + ',' + limit : '');

        Exporter.query(query,
            function(err, rows) {
                if (err) {
                    Exporter.error(err);
                    return callback(err);
                }
                //normalize here
                var topicsTagsMap = {};
                rows.forEach(function(row) {
                    topicsTagsMap[row._tid] = topicsTagsMap[row._tid] || [];
                    topicsTagsMap[row._tid].push(row._name);
                });

                // return a map of all topics with values each as an array of tags
                callback(null, topicsTagsMap);
            });
    };

    var getAttachmentsIdsUrlsMap = function(callback) {
        return getPaginatedAttachmentsIdsUrlsMap(0, -1, callback);
    };

    var getPaginatedAttachmentsIdsUrlsMap = function(start, limit, callback) {
        callback = !_.isFunction(callback) ? noop : callback;
        var prefix = Exporter.config('prefix');

        var query =
            'SELECT '
            + prefix + 'posts.ID as _aid, '
            + prefix + 'posts.post_parent as _tid, ' // i dont need this really right now
            + prefix + 'posts.guid as _url '

            + 'FROM ' + prefix + 'posts '
            + 'WHERE '
            + prefix + 'posts.post_type = "attachment" '
            + 'AND ' + prefix + 'posts.post_mime_type like \'image%\' '
            + 'AND ' + prefix + 'posts.post_parent > 0 '

            + (start >= 0 && limit >= 0 ? 'LIMIT ' + start + ',' + limit : '');

        Exporter.query(query,
            function(err, rows) {
                if (err) {
                    Exporter.error(err);
                    return callback(err);
                }
                //normalize here
                var attachmentsIdsUrlsMap = {};
                rows.forEach(function(row) {
                    attachmentsIdsUrlsMap[row._aid] = row._url;
                });

                // return a map of all topics with values each as an array of tags
                callback(null, attachmentsIdsUrlsMap);
            });
    };

    var replaceGalleryTags = function(text, attachmentsIdsUrlsMap, galleryShortcodesSetting) {
        // uncomment this line to disable auto replacement
        // return text;

        text = text || '';
        attachmentsIdsUrlsMap = attachmentsIdsUrlsMap || {};
        galleryShortcodesSetting = galleryShortcodesSetting || 'toHTML';

        var result = WPShortcode.next('gallery', text);
        var container = '';
        while (result) {
            if (result.shortcode && result.shortcode.attrs && result.shortcode.attrs.named) {
                var ids = result.shortcode.attrs.named.ids || '';

                if (galleryShortcodesSetting === 'toHTML') {
                    container = '<div data-content-index="' + result.index + '" class="imported-wp-gallery" ';
                    _.forEach(result.shortcode.attrs.named, function(value, key) {
                        container += ' data-imported-wp-gallery-' + key + '="' +  value + '" '
                    });
                    container += '>';
                    ids.split(',').forEach(function(id, i) {
                        if (attachmentsIdsUrlsMap[id]) {
                            container += '<img src="' + attachmentsIdsUrlsMap[id] + '" data-id="' + id + '" data-index="' + i + '" class="imported-wp-gallery-img" /> ' ;
                        }
                    });
                    container += '</div>';

                    text = text.replace(result.content, container);
                    result = WPShortcode.next('gallery', text);

                } else if (galleryShortcodesSetting == 'toURLs') {
                    var urls = '';
                    var idsArr = ids.split(',');
                    idsArr.forEach(function(id, i) {
                        if (attachmentsIdsUrlsMap[id]) {
                            urls += attachmentsIdsUrlsMap[id] + (i === idsArr.length - 1 ? '' : ',');
                        }
                    });

                    text = text.replace(result.shortcode.attrs.named.ids, urls);
                    result = WPShortcode.next('gallery', text, result.index + result.content.length);
                }
            } else {
                result = null;
            }
        }
        return text;
    };

    Exporter.getTopics = function(callback) {
        return Exporter.getPaginatedTopics(0, -1, callback);
    };
    Exporter.getPaginatedTopics = function(start, limit, callback) {
        callback = !_.isFunction(callback) ? noop : callback;
        var prefix = Exporter.config('prefix');
        var custom = Exporter.config('custom');
        var galleryShortcodesSetting = Exporter.config('custom').galleryShortcodes;
        var startms = +new Date();

        var query = 'SELECT ';
        if (custom && custom.bbpress) {
            // if bbpress
            query += ''
            + prefix + 'posts.ID as _tid, '
            + prefix + 'posts.post_author as _uid, '
            + prefix + 'posts.post_parent as _cid, '
            + prefix + 'posts.post_title as _title, '
            + prefix + 'posts.post_content as _content, '
            + prefix + 'posts.post_date as _timestamp, '
            + prefix + 'posts.post_name as _slug, '
            + prefix + 'posts.post_status as _wp_status, '
            + prefix + 'posts.post_type as _wp_type '

            + 'FROM ' + prefix + 'posts '
            + 'WHERE ' + prefix + 'posts.post_type="topic" '
        } else {
            query += ''
            + prefix + 'posts.ID as _tid, '
            + prefix + 'posts.post_title as _title, '
            + prefix + 'posts.post_content as _content, '
            + prefix + 'posts.post_author as _uid, '
            + prefix + 'posts.post_date as _timestamp, '
            + prefix + 'posts.post_name as _slug, '
            + prefix + 'posts.post_status as _wp_status, '
            + prefix + 'posts.post_type as _wp_type, '

            + prefix + 'terms.term_id as _cid '

            + 'FROM ' + prefix + 'posts '

                // all this crap to get the _cid
            + 'LEFT JOIN ' + prefix + 'term_relationships '
            + 'ON ' + prefix + 'posts.ID = ' + prefix + 'term_relationships.object_ID '
            + 'LEFT JOIN ' + prefix + 'term_taxonomy '
            + 'ON ' + prefix + 'term_relationships.term_taxonomy_id = ' + prefix + 'term_taxonomy.term_taxonomy_id '
            + 'LEFT JOIN ' + prefix + 'terms '
            + 'ON ' + prefix + 'terms.term_id = ' + prefix + 'term_taxonomy.term_id '
            + 'WHERE ' + prefix + 'term_taxonomy.taxonomy = "category" '

            + 'AND ' + prefix + 'posts.post_type="post" '
            + 'AND ' + prefix + 'posts.post_status="publish" '
        }
        query += (start >= 0 && limit >= 0 ? 'LIMIT ' + start + ',' + limit : '');

        getAttachmentsIdsUrlsMap(function(err, attachmentsIdsUrlsMap) {
            getTags(function(err, topicsTagsMap) {
                Exporter.query(query,
                    function(err, rows) {
                        if (err) {
                            Exporter.error(err);
                            return callback(err);
                        }
                        //normalize here
                        var map = {};
                        rows.forEach(function(row) {
                            row._title = row._title ? row._title[0].toUpperCase() + row._title.substr(1) : '';
                            row._timestamp = row._timestamp ? moment(row._timestamp).unix() * 1000 : startms;
                            row._tags = topicsTagsMap[row._tid] || undefined;
                            row._content = replaceGalleryTags(row._content, attachmentsIdsUrlsMap, galleryShortcodesSetting);
                            map[row._tid] = row;
                        });
                        callback(null, map);
                    });
            });
        });
    };

    Exporter.getPosts = function(callback) {
        return Exporter.getPaginatedPosts(0, -1, callback);
    };
    Exporter.getPaginatedPosts = function(start, limit, callback) {
        callback = !_.isFunction(callback) ? noop : callback;

        var prefix = Exporter.config('prefix');
        var custom = Exporter.config('custom');
        var startms = +new Date();

        var query = 'SELECT ';
        if (custom && custom.bbpress) {
            // if bbpress
            query += ''
            + prefix + 'posts.ID as _pid, '
            + prefix + 'posts.post_author as _uid, '
            + prefix + 'posts.post_parent as _tid, '
            + prefix + 'posts.post_content as _content, '
            + prefix + 'posts.post_date as _timestamp, '
            + prefix + 'posts.post_status as _wp_status, '
            + prefix + 'posts.post_type as _wp_type '

            + 'FROM ' + prefix + 'posts '
            + 'WHERE ' + prefix + 'posts.post_type="reply" ';
        } else {
            query += ''
            + prefix + 'comments.comment_ID as _pid, '
            + prefix + 'comments.comment_post_ID as _tid, '
            + prefix + 'comments.comment_content as _content, '
            + prefix + 'comments.user_id as _uid, '
            + prefix + 'comments.comment_date as _timestamp, '
            + prefix + 'comments.comment_author as _guest, '
            + prefix + 'comments.comment_approved as _approved, '
            + prefix + 'comments.comment_author_email as _guest_email, '
            + prefix + 'comments.comment_author_IP as _ip '
            + 'FROM ' + prefix + 'comments ';
        }

        query += (start >= 0 && limit >= 0 ? 'LIMIT ' + start + ',' + limit : '');

        Exporter.query(query,
            function(err, rows) {
                if (err) {
                    Exporter.error(err);
                    return callback(err);
                }
                //normalize here
                var map = {};
                rows.forEach(function(row) {
                    row._deleted = row._wp_status ? row._wp_status === "publish" ? 0 : 1 : row._approved === 'spam' || !row._approved ? 1 : 0;
                    row._timestamp = row._timestamp ? moment(row._timestamp).unix() * 1000 : startms;
                    map[row._pid] = row;
                });
                callback(null, map);
            });
    };

    Exporter.query = function(query, callback) {
        if (!Exporter.connection) {
            var err = {error: 'MySQL connection is not setup. Run setup(config) first'};
            Exporter.error(err.error);
            return callback(err);
        }
        //console.log('\n\n====QUERY====\n\n' + query + '\n');
        Exporter.connection.query(query, function(err, rows) {
            callback(err, rows)
        });
    };

    Exporter.teardown = function(callback) {
        Exporter.log('teardown');
        Exporter.connection.end();

        Exporter.log('Done');
        callback();
    };

    Exporter.testrun = function(config, callback) {
        async.series([
            function(next) {
                Exporter.setup(config, next);
            },
            function(next) {
                Exporter.getUsers(next);
            },
            function(next) {
                Exporter.getCategories(next);
            },
            function(next) {
                Exporter.getTopics(next);
            },
            function(next) {
                Exporter.getPosts(next);
            },
            function(next) {
                Exporter.teardown(next);
            }
        ], callback);
    };

    Exporter.warn = function() {
        var args = _.toArray(arguments);
        args.unshift(logPrefix);
        console.warn.apply(console, args);
    };

    Exporter.log = function() {
        var args = _.toArray(arguments);
        args.unshift(logPrefix);
        console.log.apply(console, args);
    };

    Exporter.error = function() {
        var args = _.toArray(arguments);
        args.unshift(logPrefix);
        console.error.apply(console, args);
    };

    Exporter.config = function(config, val) {
        if (config != null) {
            if (typeof config === 'object') {
                Exporter._config = config;
            } else if (typeof config === 'string') {
                if (val != null) {
                    Exporter._config = Exporter._config || {};
                    Exporter._config[config] = val;
                }
                return Exporter._config[config];
            }
        }
        return Exporter._config;
    };

    // from Angular https://github.com/angular/angular.js/blob/master/src/ng/directive/input.js#L11
    Exporter.validateUrl = function(url) {
        var pattern = /^(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?$/;
        return url && url.length < 2083 && url.match(pattern) ? url : '';
    };

    Exporter.truncateStr = function(str, len) {
        if (typeof str != 'string') return str;
        len = _.isNumber(len) && len > 3 ? len : 20;
        return str.length <= len ? str : str.substr(0, len - 3) + '...';
    };

    Exporter.whichIsFalsy = function(arr) {
        for (var i = 0; i < arr.length; i++) {
            if (!arr[i])
                return i;
        }
        return null;
    };

})(module.exports);
