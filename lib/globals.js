exports.isEmptyHack=isEmptyHack;
exports.precision=precision;
exports.pad = pad;
exports.time_formatter = time_formatter;
exports.y2lat=y2lat;
exports.lat2y=lat2y;
exports.polymaps_coordinateLocation=polymaps_coordinateLocation;
exports.bbox_from_xyz=bbox_from_xyz;
exports.aggregation=aggregation;
exports.sum_variables     = sum_variables    ;
exports.n_avg_variables   = n_avg_variables  ;
exports.hh_avg_variables  = hh_avg_variables ;
exports.nhh_avg_variables = nhh_avg_variables;
exports.variables         = variables;

var variables = [
        'ts','hh','not_hh','n','o'
        ,'avg_hh_weight','avg_hh_axles','avg_hh_spd'
        ,'avg_nh_weight','avg_nh_axles','avg_nh_spd'
        ,'avg_veh_spd'
];
var sum_variables = [
        'hh','not_hh','n'
];

var n_avg_variables = [
        'o'
        ,'avg_veh_spd'
];
var hh_avg_variables = [
        'avg_hh_weight','avg_hh_axles','avg_hh_spd'
];
var nhh_avg_variables = [
        'avg_nh_weight','avg_nh_axles','avg_nh_spd'
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

