var express = require('express')
  , _       = require('underscore')
  , util    = require('util')
  , router  = express.Router()
  , txt2json = require('./txt2json')
  ;

var first_table = txt2json.data['0']; 
var first_meta  = first_table.meta;
console.dir(first_meta);

var shifter = ['1','2','3']; // Row, Col, Date

router.use(handleErrors);
function handleErrors(err, req, res, next) {
      res.send('This is your custom error page.');
}
/* GET home page. */
router.get('/', function(req, res, next) {
  var d3 = shifter['2'];
  var most_recent = first_meta[d3].slice(-1)[0];
  res.redirect(most_recent);
});

router.get('/shiftLeft', function(req, res, next) {
  shifter.unshift(shifter.pop());
  res.redirect('/');
});

router.get('/shiftRight', function(req, res, next) {
  shifter.push(shifter.shift());
  res.redirect('/');
});

router.get('/switchRolCol', function(req, res, next) {
  var tmp = shifter['0'];
  shifter['0'] = shifter['1'];
  shifter['1'] = tmp;
  res.redirect('/');
});

router.get(/\w+/, function(req, res, next) {
  url = req.url.substr(1); // url: '/20150313', originalUrl: '/20150313',
  console.dir(url);
  var d1 = shifter['0']
    , d2 = shifter['1']
    , d3 = shifter['2'];
  if (! _.contains(first_meta[d3], url)) {
      res.status(404).send(util.format("'%s' is not a proper value for current implicit dimention", url));
      return;
  }

  var day_data = _.filter(first_table.data, function(row) { return row[d3] == url; });
  var grp_data = _.groupBy(day_data, function(row) { return row[d2]; });
  var rows = _.map(grp_data, function(v, k) {
      return { cells: _.map(_.flatten([k, _.pluck(v, '0')]), function(v) { return {v:v}; }) };
  });

  var ths = _.map(_.flatten(['*', meta[d1]]), function(v) { return {v:v}; });
  var hcjs = {
        title: { text: url },
        xAxis: { categories: meta[d1] },
        series: _.map(grp_data, function(v, k) {
                    return { name: k, data: _.map(_.pluck(v,'0'), function(v) { return parseFloat(v.replace(/,/g,'')); }) }
                })
  };
  res.render('index', { title: 'MatPro'
                      , tname: first_table.name
                      , ths: ths
                      , implicit_dim: util.format("Dim-%s", d3)
                      , implicit_val: url
                      , dates: _.map(first_meta[d3], function(v) { return {v:v}; })
                      , hcjs: JSON.stringify(hcjs)
                      , rows: rows });
});

module.exports = router;
