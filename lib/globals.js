var querystring = require('querystring');
var meters_to_miles =  0.000621371192;

// [1, 10, 509.456, 0.022163, 38.111, 2504.064, 668.937, 205.656, 29.895, 1992.135, 256.027, 64.206, 496188.029, 6936.57]
var variable_order = {'count':0
                     ,'imputations':1
                     ,'n':2
                     ,'o':3
                     ,'heavyheavy':4
                     ,'hh_speed'  :5
                     ,'hh_weight' :6
                     ,'hh_axles':7
                     ,'not_heavyheavy':8
                     ,'nhh_speed':9
                     ,'nhh_weight':10
                     ,'nhh_axles':11
                     ,'wgt_spd_all_veh_speed':12
                     ,'count_all_veh_speed':13};


var n_weighted_variables = ['o'
                           ,'avg_veh_spd'];
var hh_weighted_variables = ['avg_hh_weight'
                            ,'avg_hh_axles'
                            ,'avg_hh_spd'];
var nh_weighted_variables = ['avg_nh_weight'
                            ,'avg_nh_axles'
                            ,'avg_nh_spd'
                            ];


function isEmptyHack(o){
    for (var k in o){
        return false;
    }
    return true;
}
function precision(zoom){
    return     Math.ceil(Math.log(zoom-0) / Math.LN2);
}

function get_bbox(req){
    var bbox;
    var bb;
    if(req.params.bbox){
        bb = req.params.bbox;
    }else{
        bb = bbox_from_xyz({row: req.params.row, column: req.params.column, zoom: req.params.zoom});
    }
    if( /(-?\d+\.\d+).*?(-?\d+\.\d+).*?(-?\d+\.\d+).*?(-?\d+\.\d+)/.exec(bb)){
        var p1 = RegExp.$1;
        var q1 = RegExp.$2;
        var p2 = RegExp.$3;
        var q2 = RegExp.$4;
        // build the bounding box
        var pn = precision(req.params.zoom);
        var overlap = 1/Math.pow(10,pn);
        var tolerance = overlap;
        var bbox = "ST_Envelope(ST_GeomFromEWKT('SRID=4326;POLYGON(("
                 +p1+' '+q1+','
                 +p1+' '+q2+','
                 +p2+' '+q2+','
                 +p2+' '+q1+','
                 +p1+' '+q1
                 +"))'))";
    }
    return bbox;
}
// Encode only key, startkey and endkey as JSON
var toQuery = function(query) {
  for (var k in query) {
    if (['key', 'startkey', 'endkey'].indexOf(k) != -1) {
      query[k] = JSON.stringify(query[k]);
    } else {
      query[k] = String(query[k]);
    }
  }
  return querystring.stringify(query);
};

function pad(n){return n<10 ? '0'+n : n}
function time_formatter(d){
    return [d.getFullYear()
           , pad(d.getMonth()+1)
           , pad(d.getDate())]
        .join('-')+'T'+ pad(d.getHours())+':00:00Z';
}

// See http://wiki.openstreetmap.org/wiki/Mercator

function y2lat(y) {
    return 360 / Math.PI * Math.atan(Math.exp(y * Math.PI / 180)) - 90;
}

function lat2y(lat) {
    return 180 / Math.PI * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
}

var polymaps_coordinateLocation = function(c) {
    var k = 45 / Math.pow(2, c.zoom - 3);
    return {
        lon: k * c.column - 180,
        lat: y2lat(180 - k * c.row)
    };
};


var bbox_from_xyz = function(c){
    var max = c.zoom < 0 ? 1 : 1 << c.zoom,
    column = c.column % max;
    if (column < 0) column += max;
    var row = c.row - 0;
    var zoom = c.zoom - 0;

    var nw = polymaps_coordinateLocation({row: row, column: column, zoom: zoom}),
    se = polymaps_coordinateLocation({row: row + 1, column: column + 1, zoom: zoom}),
    pn = Math.ceil(Math.log(c.zoom) / Math.LN2);

    return nw.lon.toFixed(pn)
        + "," + se.lat.toFixed(pn)
        + "," + se.lon.toFixed(pn)
        + "," + nw.lat.toFixed(pn);

}

var aggregation = {
    'monthly':function(ts,endts){
                  if(!ts) ts = 'ts';
                  return {'startagg':  "to_char("+ts+", 'YYYY-MM-01')"
                         ,'groupagg':  "to_char("+ts+", 'YYYY-MM-01')"
                         };
              }
    ,'weekly':function(ts,endts){
                  if(!ts) ts = 'ts';
                  // weeks are complicated.  Using ISO week
                  var dateweek = "to_char("+ts+",'IYYY-IW-01')";
                  var weekdate = "to_date("+dateweek+", 'IYYY-IW-ID')";

                  return {'startagg':  "to_char("+weekdate+", 'YYYY-MM-DD')"
                         ,'groupagg': "to_char("+weekdate+", 'YYYY-MM-DD')"
                         };
              }
    ,'daily':function(ts,endts){
                 if(!ts) ts = 'ts';
                 return {'startagg':  "to_char("+ts+", 'YYYY-MM-DD')"
                        ,'groupagg':  "to_char("+ts+", 'YYYY-MM-DD')"
                        };
             }
    ,'hourly':function(ts,endts){
                  if(!ts) ts = 'ts';
                  return {'startagg':  "to_char("+ts+", 'YYYY-MM-DD\"T\"HH24:00:00')"
                         ,'groupagg':  "to_char("+ts+", 'YYYY-MM-DD\"T\"HH24:00:00')"
                         };
              }
    ,'yearly':function(ts,endts){
        if(!ts) ts = 'ts';
        if(!ts) endts = 'endts';
        return {'startagg':  "to_char("+ts+", 'YYYY-01-01')"
                ,'groupagg':  "to_char("+ts+", 'YYYY-01-01')"
               };
    }
};


function match_district (did){
    if(/wim/.test(did)){
        // WIM data is in the wim district!
        return 'wim';
    }
    var district_regex = /^(\d{1,2})\d{5}$/;
    var match = district_regex.exec(did);
    if (match && match[1] !== undefined){
        return ['d',pad(match[1])].join('');
    }
    return null;
}



var group_level=5; // hourly aggregation in couchdb.  daily is 4, monthly is 3, yearly is 2

var group = function(set){
        if(set !== undefined) {
            group_level=set;
        }
        return group_level;
    };


var request = require('request');
var _ = require('underscore');
var lanehash = {};
function getLanes(options){
    var env = process.env;
    var cuser = options.user || process.env.COUCHDB_USER ;
    var cpass = options.pass || process.env.COUCHDB_PASS ;
    var chost = options.host || env.COUCHDB_HOST ;
    var cport = options.port || env.COUCHDB_PORT || 5984;
    var trackerdbname = options.trackerdbname || env.COUCHDB_TRACKINGDB || 'vdsdata%2ftracking';

    var couch = 'http://'+chost+':'+cport;
    var tracker = couch +'/'+trackerdbname;
    return function(error,cb){
        if(error){
            cb(error);
            return null;
        }
        var did = options.detector_id;
        var year = options.year;
        var tracker_source = tracker + '/'+did;
        if(lanehash[did] && lanehash[did][year]){
            cb(null,_.extend(options,{'lanes':lanehash[did][year]}));
        }else{
            if(lanehash[did]===undefined){
                lanehash[did]={};
            }
            request(tracker_source
            ,function(error,response,body){
                // pick off the lanes, send to callback, also store in
                // a local hash
                var doc = JSON.parse(body);
                 if(doc[year] !== undefined
                  && doc[year].properties !== undefined
                  && doc[year].properties.length > 0
                  && doc[year].properties[0].lanes !== undefined)
                {
                    lanehash[did][year]=doc[year].properties[0].lanes;
                }else{
                    // okay, there are a few cases (as demonstrated by site 400793) where I have data but no metadata on the site for that year
                    // so just run a grep over the body and extract the lanes value
                    var match = /"lanes":(\d+)/.exec(body);
                    if(match && match[1]){
                        lanehash[did][year]=match[1];
                    }else{
                        // sometimes we just have no information.
                        // guessing here
                        lanehash[did][year]=2
                        //throw new Error('getLanes, doc is '+body+'\nmatch is '+JSON.stringify(match))
                    }
                }
                cb(null,_.extend(options,{'lanes':lanehash[did][year]}));
            });
        }
        return null;
    };
}

var fips_lookup ={ '06001' : 'Alameda'
                   ,'06003' : 'Alpine'
                   ,'06005' : 'Amador'
                   ,'06007' : 'Butte'
                   ,'06009' : 'Calaveras'
                   ,'06011' : 'Colusa'
                   ,'06013' : 'Contra Costa'
                   ,'06015' : 'Del Norte'
                   ,'06017' : 'El Dorado'
                   ,'06019' : 'Fresno'
                   ,'06021' : 'Glenn'
                   ,'06023' : 'Humboldt'
                   ,'06025' : 'Imperial'
                   ,'06027' : 'Inyo'
                   ,'06029' : 'Kern'
                   ,'06031' : 'Kings'
                   ,'06033' : 'Lake'
                   ,'06035' : 'Lassen'
                   ,'06037' : 'Los Angeles'
                   ,'06039' : 'Madera'
                   ,'06041' : 'Marin'
                   ,'06043' : 'Mariposa'
                   ,'06045' : 'Mendocino'
                   ,'06047' : 'Merced'
                   ,'06049' : 'Modoc'
                   ,'06051' : 'Mono'
                   ,'06053' : 'Monterey'
                   ,'06055' : 'Napa'
                   ,'06057' : 'Nevada'
                   ,'06059' : 'Orange'
                   ,'06061' : 'Placer'
                   ,'06063' : 'Plumas'
                   ,'06065' : 'Riverside'
                   ,'06067' : 'Sacramento'
                   ,'06069' : 'San Benito'
                   ,'06071' : 'San Bernardino'
                   ,'06073' : 'San Diego'
                   ,'06075' : 'San Francisco'
                   ,'06077' : 'San Joaquin'
                   ,'06079' : 'San Luis Obispo'
                   ,'06081' : 'San Mateo'
                   ,'06083' : 'Santa Barbara'
                   ,'06085' : 'Santa Clara'
                   ,'06087' : 'Santa Cruz'
                   ,'06089' : 'Shasta'
                   ,'06091' : 'Sierra'
                   ,'06093' : 'Siskiyou'
                   ,'06095' : 'Solano'
                   ,'06097' : 'Sonoma'
                   ,'06099' : 'Stanislaus'
                   ,'06101' : 'Sutter'
                   ,'06103' : 'Tehama'
                   ,'06105' : 'Trinity'
                   ,'06107' : 'Tulare'
                   ,'06109' : 'Tuolumne'
                   ,'06111' : 'Ventura'
                   ,'06113' : 'Yolo'
                   ,'06115' : 'Yuba'
                 }
function replace_fips(str){
    // search and replace fips code with county name
    var refips = /(06\d\d\d)/;
    var newstr = str;
    var m = refips.exec(str);
    if(m) newstr = str.replace(refips, fips_lookup[m[1]]);
    return newstr;
}


function convertDetectorIdForCouchDB(did,features){
    did = String(did)
    var numericpart = did.match(/\d+/);
    // assume vds, then test for wim
    var detector_id = numericpart[0];
    // special handling for WIM
    if(/wim/.test(did)){
        // WIM data has a direction
        var dir = features[key][0].properties.direction;
        detector_id = ['wim',numericpart[0],dir.charAt(0).toUpperCase()].join('.');
    }
    return detector_id
}
// direction lookup

var direction_lookup ={'N':'north'
                      ,'S':'south'
                      ,'W':'west'
                      ,'E':'east'
                      };
function convertDetectorIdForSQLwhere(did){
    did = String(did)
    var numericpart = did.match(/\d+/);
    // assume vds, then test for wim
    var detector_id = numericpart[0];
    var whereclause = ['detector_id=vdsid_'+detector_id];
    // special handling for WIM
    if(/wim/.test(did)){
        // WIM data has a direction
        var directionpart = did.match(/\.(.)$/);
        var dir = direction_lookup[directionpart[1]];
        whereclause = ['detector_id=wimid_'+detector_id
                      ,'direction='+dir
                      ];
    }
    return whereclause;
}
function convertDetectorIdForSQL(did){
    did = String(did)
    var numericpart = did.match(/\d+/);
    // assume vds, then test for wim
    var detector_id = numericpart[0];
    var sqlid = 'vdsid_'+detector_id;
    // special handling for WIM
    if(/wim/.test(did)){
        // WIM data has a direction
        var directionpart = did.match(/\.(.)$/);
        var dir = direction_lookup[directionpart[1]];
        sqlid = 'wimid_'+detector_id
    }
    return sqlid;
}

exports.convertDetectorIdForSQL=convertDetectorIdForSQL;
exports.convertDetectorIdForSQLwhereconvertDetectorIdForSQLwhere;
exports.convertDetectorIdForCouchDB=convertDetectorIdForCouchDB;
exports.replace_fips=replace_fips;
exports.meters_to_miles=meters_to_miles;
exports.isEmptyHack=isEmptyHack;
exports.precision=precision;
exports.get_bbox=get_bbox;
exports.pad = pad;
exports.time_formatter = time_formatter;
exports.y2lat=y2lat;
exports.lat2y=lat2y;
exports.polymaps_coordinateLocation=polymaps_coordinateLocation;
exports.bbox_from_xyz=bbox_from_xyz;
exports.aggregation=aggregation;
exports.variable_order         = variable_order;
exports.district_from_detector = match_district;
exports.toQuery = toQuery;
exports.group = group;
exports.getLanes=getLanes;
exports.n_weighted_variables  = n_weighted_variables;
exports.hh_weighted_variables = hh_weighted_variables;
exports.nh_weighted_variables = nh_weighted_variables;
