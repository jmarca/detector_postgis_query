/* global exports */
var querystring = require('querystring')
var geom_utils = require('geom_utils')
var superagent = require('superagent');
var _ = require('lodash');

var bbox_from_xyz = geom_utils.bbox_from_xyz
var precision = geom_utils.precision

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
        bbox = "bounding_area as ( select ST_Envelope(ST_GeomFromEWKT('SRID=4326;POLYGON(("
                 +p1+' '+q1+','
                 +p1+' '+q2+','
                 +p2+' '+q2+','
                 +p2+' '+q1+','
                 +p1+' '+q1
                 +"))')) as geom )";
    }
    return bbox;
}
// Encode only key, startkey and endkey as JSON


var pad = geom_utils.pad
var time_formatter = geom_utils.time_formatter
// See http://wiki.openstreetmap.org/wiki/Mercator


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
    // need an hpms check here
    //todo:  hpms pattern check
    return null;
}



var group_level=5; // hourly aggregation in couchdb. by lane is 6,
                   // hourly is 5, daily is 4, monthly is 3,
                   // yearly is 2

var group = function(set){
        if(set !== undefined) {
            group_level=set;
        }
        return group_level;
    };



function convertDetectorIdForCouchDB(did,features){
    did = String(did)
    var numericpart = did.match(/\d+/);
    // assume vds, then test for wim
    var detector_id = numericpart[0];
    // special handling for WIM
    if(/wim/.test(did)){
        // WIM data has a direction
        var dir
        if(features.properties && features.properties.direction !== undefined){
            dir = features.properties.direction;
            detector_id = ['wim',numericpart[0],dir.charAt(0).toUpperCase()].join('.');
        }else{
            // punt
            detector_id=did
        }
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

/**
 * get_time
 * @param  req an express/connect request object
 * @param ts a text string, defaults to 'ts'
 * @param endts a text string, defaults to 'endts'
 * @return an object, containing
 *            { start: the start time as a Date object
 *              end:   the end time as a Date object
 *              startend: a sql where clause that looks like
 *   [
 *       endts+" >= to_timestamp("+start.getTime()/1000+")"
 *              ,ts+" <  to_timestamp("+end.getTime()/1000+")"
 *   ].join(' and ');
 *
 */
function get_time(req,ts,endts){
    ts = ts ? ts :  'ts';
    endts = endts ? endts :  'endts';
    var startend={};
    var start;
    var end;
    var yr = +req.params.year;
    if(yr && req.params.month){
        // new Date(year, month, day, hours, minutes, seconds, ms)
        start = new Date(yr,req.params.month - 1,1,0,0,0);
        end   = new Date(yr,req.params.month,1,0,0,0);

    }else{
        // get a whole year
        start = new Date(yr  ,0,1,0,0,0);
        end   = new Date(yr+1,0,1,0,0,0);

    }
    startend.start=start;
    startend.end=end;
    startend.startend =  [
        endts+" >= to_timestamp("+start.getTime()/1000+")"
               ,ts+" <  to_timestamp("+end.getTime()/1000+")"
    ].join(' and ');

    // handle aggregation level
    var aggregate = 'hourly';
        if(req.params.aggregate){
            aggregate = req.params.aggregate;
        }

    return startend;
}

exports.replace_fips=geom_utils.replace_fips;
exports.meters_to_miles=geom_utils.meters_to_miles;
exports.isEmptyHack=isEmptyHack;
exports.precision=geom_utils.precision;
exports.get_bbox=geom_utils.get_bbox;
exports.get_bbox_with_format=geom_utils.get_bbox_with_format
exports.get_time=get_time;
exports.pad = geom_utils.pad;
exports.time_formatter = geom_utils.time_formatter;
exports.y2lat=geom_utils.y2lat;
exports.lat2y=geom_utils.lat2y;
exports.polymaps_coordinateLocation=geom_utils.polymaps_coordinateLocation;
exports.toQuery = geom_utils.toQuery
exports.bbox_from_xyz=geom_utils.bbox_from_xyz;

exports.convertDetectorIdForSQL=convertDetectorIdForSQL;
exports.convertDetectorIdForSQLwhereconvertDetectorIdForSQLwhere;
exports.convertDetectorIdForCouchDB=convertDetectorIdForCouchDB;

exports.aggregation=aggregation;
exports.variable_order         = variable_order;
exports.district_from_detector = match_district;
exports.group = group;
//exports.getLanes=getLanes;  //used request, just killed it
exports.n_weighted_variables  = n_weighted_variables;
exports.hh_weighted_variables = hh_weighted_variables;
exports.nh_weighted_variables = nh_weighted_variables;
