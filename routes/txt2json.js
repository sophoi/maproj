/* converts table-format txt files into json format representing multi-dimentional data
 *
 * configurables:
 * - begin and end of a table, or tables
 * - number or pattern of lines to ignore
 * - table headers (almost always implicit and no need to config)
 * - how to strip off in-line comments or other irrelevants (implicit)
 *
 * function as:
 * - standalone script to convert batches of archived files
 * - nodejs module to work as part of matprojs
 * - export processed result, for example into mongledb
 *
 * assumptions:
 * - table text files are assumed to be short, hence process time is of no concern
 * - possible to run in parallel or on grid should speed or backfill requrement surface
 * - for speedy/interactive use preprocessing into database or nosql is recommended
 * - throw rather than exit on error, so as to be used in different scenarios
 */
var util        = require('util')
  , sprintf     = require('sprintf-js').sprintf
  , zlib        = require('zlib')
  , fs          = require('fs')
  , _           = require('underscore')
  ;
var log_level   = 2;
var log_verbose = function () { if (log_level > 3) { console.log.apply(null, arguments); } };

var config = require(process.cwd() + '/config.json');

var all_data = read_files(config);
module.exports.data = all_data;

/* render configurations for multiple types of tables
 * keep order of tables the same as specified in config file
 * then retrieve all data within dates ranges
 * output as multi-variate records: data-value 1d-header 2d-header 3d-header ...
 *           along with meta-data of every dimension
 */
function read_files(config) {
    var required_config = function (o, c) {
        if (! o.hasOwnProperty(c)) {
            throw util.format("required config '%s' not specified in config.json: %s", c, JSON.stringify(o));
        }
        // XXX check empty string
    }
    required_config(config, 'start-date');
    required_config(config, 'tables');

    var slashize_date = function (d) {
        slashy = ! d.match(/^20\d{6}$/) ? d
               : d.substr(0,4) + '/' + d.substr(4,2) + '/' + d.substr(6,2)
        if (! slashy.match(/^20\d\d\/\d\d\/\d\d$/))
            throw util.format("not a properly formated date specified: '%s'", d);
        return slashy;
    }
    var start_date = slashize_date(config["start-date"]);
    var end_date = undefined;
    if (config.hasOwnProperty('end-date')) {
        var d = config["end-date"];
        if (! d.match(/yesterday/i)) { end_date = slashize_date(d); }
    }
    var dates = date_range(start_date, end_date);
    console.log("date_range: " + dates[0] + (dates.length <= 1 ? "" : " -- " + dates[dates.length-1]));

    var tables = config.tables;
    var filled_tables = new Array();
    [].forEach.call(Object.keys(tables), function(i) {
        log_verbose(i, tables[i]);
        required_config(tables[i], 'table-name');
        required_config(tables[i], 'file-pattern');
        if (! (tables[i].hasOwnProperty('enabled') && tables[i].enabled)) { return; }
        console.log(">> processing:", tables[i]);

        var pattern = file_pattern(tables[i]['file-pattern']);
        console.log(">> pattern:", pattern);
        var unslashize_date = function (slashy_day) {
            return slashy_day.substr(0,4) + slashy_day.substr(5,2) + slashy_day.substr(8,2);
        }
        var dated_files = _.map(dates, function(d) {
            return [unslashize_date(d), apply_pattern(pattern, d)];
        });
        console.log(dated_files);

        db = _.reduce( dated_files, function(accu, df) {
            if (fs.existsSync(df[1])) {
                var itm = read_file(df, tables[i]);
                if (typeof itm != 'undefined')
                    return accu.concat(itm);
            }
            return accu;
        }, []);
        log_verbose(db);
        meta = _.reduce( db, function(accu, r) {
            r.forEach(function (elem, idx, arr) {
                if (idx == '0') { return; }
                if (accu.hasOwnProperty(idx)) {
                    if (! _.contains(accu[idx], elem)) { accu[idx].push(elem); }
                } else { accu[idx] = [elem]; }
            });
            return accu;
        }, {});
        filled_tables[filled_tables.length] = { name: tables[i]['table-name']
                                              , data: db
                                              , meta: meta
                                              };
    });
    return filled_tables;
}

function read_file(df, config) {
    var getIntConfig = function(name, dft) {
        if (! config.hasOwnProperty(name)) { return dft; }
        var i = parseInt(config[name], 10)
        if (isNaN(i)) { throw util.format("not a proper int in '%s': %s", name, JSON.stringify(config)); }
        return i;
    };
    var getPatternConfig = function(name) {
        if (! config.hasOwnProperty(name)) { return undefined; }
        var s = config[name];
        if (typeof s != 'string') { throw util.format("not a proper string pattern in '%s': %s", name, JSON.stringify(config)); }
        s = s.trim();
        if (s.length == 0) { throw util.format("empty string pattern in '%s': %s", name, JSON.stringify(config)); }
        return s;
    }

    var day = df[0];
    var skip_daystr = getPatternConfig('skip-days');
    var skip_days = typeof skip_daystr == 'string' ? skip_daystr.split(/,/) : [];
    if (_.contains(skip_days, day)) { return undefined; }

    var header_lineno   = getIntConfig('header-line', 1);
    var start_lineno    = getIntConfig('start-line', 2);
    var end_lineno      = getIntConfig('end-line', -1);
    var start_pattern   = getPatternConfig('start-pattern');
    var end_pattern     = getPatternConfig('end-pattern');
    var skip_pattern    = getPatternConfig('skip-pattern');
    var skip_linenostr  = getPatternConfig('skip-lines');
    // pattern overrides lineno
    if (typeof start_pattern == 'string') { start_lineno = -1; }
    if (typeof end_pattern   == 'string') { end_lineno   = -1; }
    var skip_linenos = typeof skip_linenostr == 'string' ? skip_linenostr.split(/,/) : [];

    var fname = df[1];
    var data = (fname.substr(-3) === '.gz') ? zlib.gunzipSync(fs.readFileSync(fname))
                                            : fs.readFileSync(fname);
    var lines = data.toString().split('\n');
    var headers = undefined;
    var ingear = false;
    log_verbose(util.format("header_lineno: %d, start_lineno: %d, end_lineno: %d", header_lineno, start_lineno, end_lineno));
    var o = new Array();
    var row = 0;
    [].forEach.call(Object.keys(lines), function(i) {
        var curln = parseInt(i,10)+1;
        var line = lines[i].trim();
        if (line.length == 0) { return; }

        if (curln == header_lineno) { headers = line.split(/\s+/); return; }
        if (typeof headers == 'undefined') { return; }

        if (typeof start_pattern == 'string' && line.match(start_pattern)
            || curln == start_lineno) {
            ingear = true;
        }
        if (typeof end_pattern == 'string' && line.match(end_pattern)
            || curln == end_lineno) {
            ingear = false;
        }

        if (! ingear || curln in skip_linenos ||
            (typeof skip_pattern == 'string' && line.match(skip_pattern)) )
            { return; }

        var datums = line.split(/\s+/);
        if (datums.length != headers.length) { throw util.format("row #%d contains %d items, but there are %d headers: '%s'",
                                                                 curln, datums.length, headers.length, line); }

        var rowname = undefined;
        row++;
        [].forEach.call(Object.keys(headers), function(col) {
            //o[headers[col]] = datums[col];
            if (col == '0') { rowname = row+'-'+datums[col]; }
            else { o[o.length] = [datums[col], col+'-'+headers[col], rowname, day]; }
        });
        log_verbose(i, lines[i]);
    });
    log_verbose(o);
    return o;
}

function test_pattern() {
    var testfile = "/path/2015/03/12/prefix.20150312.txt";
    var pattern = file_pattern(testfile);
    // [ '2015/03/12', index: 6, input: '/path/2015/03/12/prefix.20150312.txt' ] 
    console.log(testfile);
    console.log(pattern);
    var nextfile = apply_pattern(pattern, '2015/02/03');
    console.log(nextfile);
}

function apply_pattern(pattern, slashy_day) {
    var path = "";
    var day = slashy_day.substr(0,4) + slashy_day.substr(5,2) + slashy_day.substr(8,2);
    pattern.forEach(function (elem, idx, arr) {
        if (typeof elem == "boolean") {
            path = path + (elem ? slashy_day : day);
        } else { // "string"
            path = path + elem;
        }
    });
    return path;
}

function file_pattern(filepath) {
    var parts = new Array();
    var path = filepath;
    while (1) {
        var m = path.match(/\b\d{8}\b|\b\d{4}.\d\d.\d\d\b/);
        if (m) {
            if (m.index > 0) { parts[parts.length] = path.substr(0, m.index); }
            parts[parts.length] = m['0'].length > 8; // date: slashy or not
            path = path.substr(m.index + m['0'].length);
        } else {
            break;
        }
    }
    parts[parts.length] = path;
    return parts;
}

/* begin/end in yyyy/mm/dd format, range [begin, end] may be incremental/decremental
 * if end is omnited yesterday is used
 */
function date_range(begin, end) {
    var begin_ts = Date.parse(begin);
    if (isNaN(begin_ts)) {
        throw new Error('begin provided is not a valid date, expected format yyyy/mm/dd');
    }

    if (typeof end == 'undefined') {
        yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0);
        yesterday.setMinutes(0);
        yesterday.setSeconds(0);
        yesterday.setMilliseconds(0);
        end = yesterday;
    }
    var end_ts = Date.parse(end)
    if (isNaN(end_ts)) {
        throw new Error('end provided is not a valid date, expected format yyyy/mm/dd');
    }

    var dir = (begin_ts < end_ts) ? 1 : -1;

    function date2yyyymmdd(day) {
        return sprintf("%d/%02d/%02d", day.getFullYear(), (day.getMonth()+1), day.getDate());
    }

    var ts = begin_ts;
    var day = new Date();
    var range = new Array();
    while ((ts - end_ts) * dir <= 0) {
        day.setTime(ts);
        range[range.length] = date2yyyymmdd(day);
        day.setDate(day.getDate() + dir);
        ts = day.getTime();
    }
    return range;
}

/* render json for one type of table
 */
function convert_to_json(table_config, date_range) {
}

