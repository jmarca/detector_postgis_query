/** geoQuery
*
* this provides the length of the segment, the central detector for
* the segment, and the time over which the length is active for the
* central detector.
*
**/
var get_time=require('./get_time').get_time
var geom_utils=require('geom_utils')
var _ = require('lodash') // fixme only using this for isFunction call...

function geoQuery(req,opts,next){
    var startend = get_time(req)
    if(_.isFunction(opts)){
        next = opts
        opts = {}
    }
    var bbox = geom_utils.get_bbox(req,{'area_type_param':opts.area_type_param
                                       ,'area_param':opts.area_param})
    if(bbox===undefined){
        // die die die
        throw new Error('die without a bounding box')
    }
    var pn = geom_utils.precision(req.params.zoom)
    if(!pn){pn=14;}
    var overlap = 1/Math.pow(10,pn);
    var tolerance = overlap;

    return function(err, client,done) {
        if(err){
            console.log('connection error, line 20, geoQuery.js '+JSON.stringify(err));
            next(err);
            return;
        }

        var select_properties =
            {  'dsc.ts' : 'ts'
            ,'dsc.endts' : 'endts'
            ,'components':'components'
            ,'detector_id':'detector_id'
            ,'refnum':'freeway'
            ,'direction':'direction'
            };

        var cols = [];
        var keys = [];
        var geom =  'seggeom';

        var subselectcols = '';
        for (var key in select_properties){
            if( key != 'dsc.ts' && key != 'dsc.endts'){
                cols.push(key +" as "+ select_properties[key]);
                keys.push(key);
            }
        }
        // handle times.  from the scratch work I had:
        //,extract( epoch from ( GREATEST('01 Jan 2008 08:00:00 GMT',dsc.ts AT TIME ZONE 'UTC')) ) as ts
        //,extract( epoch from ( LEAST('01 Jan 2009 08:00:00 GMT',dsc.endts AT TIME ZONE 'UTC')) ) as endts
        cols.push("extract( epoch from ( GREATEST (to_timestamp("+startend.start.getTime()/1000+"),dsc.ts)) ) as ts");
        cols.push("extract( epoch from ( LEAST (to_timestamp("  +startend.end.getTime()/1000 +"),dsc.endts)) ) as endts");

        var propcols = cols.join(",");
        var subselect = keys.join(",");

        // bigquery pulls the length and the geometry plus other stuff from
        // osm.tempseg.versioned_detector_segment_geometry
        //
        // this provides the length of the segment, the central
        // detector for the segment, and the time over which the
        // length is active for the central detector.  Then the
        // next step is to pull the observation data for this
        // detector for the appropriate time period, and weight it
        // by the length, as appropriate
        var bigquery;
        if( req.params[opts.area_param] ){
            bigquery= [
                "select len,fulllen,geojson,"+propcols
              ,"FROM ( select "+subselect
              ,"  ,st_length(st_transform(snipgeom,32611)) * " + geom_utils.meters_to_miles + " as len"
              ,"  ,st_length(st_transform(fullgeom,32611)) * " + geom_utils.meters_to_miles + " as fulllen"
              ," ,st_asgeojson(ST_Simplify(snipgeom,"+tolerance+"),"+pn+") as geojson"
              ," ,st_asgeojson(ST_Simplify(fullgeom,"+tolerance+"),"+pn+") as fullgeojson"
              ,"  FROM ( select vdsg.*"
              ,"    ,(ST_Dump(ST_Intersection(area.geom,"+geom+"))).geom as snipgeom"
              ,"    ,"+geom+" as fullgeom"
              ,"    FROM tempseg.versioned_detector_segment_geometry vdsg"
                // hack in a fix for the grid problem
                //
              ,"  join tempseg.tdetector ttd ON (vdsg.detector_id=ttd.detector_id and newtbmap.canonical_direction(vdsg.direction)=newtbmap.canonical_direction(ttd.direction) and vdsg.refnum=ttd.refnum)"
              ,"    join "+bbox+" ON (st_intersects(seggeom,area.geom))"
                // hack in a fix for the grid problem
                //
              ,"    WHERE   ttd.geom && area.geom "

              ," )pickgeom"
              ,")lengthsgeom"
              ,"JOIN tempseg.detector_segment_conditions dsc USING (components,direction)"
              ,"WHERE"
              , startend.startend
                // limit to periods of an hour or more
              ," and round ( extract( epoch from ( "
              ,"      (   LEAST  (to_timestamp(" + startend.end.getTime()/1000+"),dsc.endts)) "
              ,"    - ( GREATEST (to_timestamp("+startend.start.getTime()/1000+"),dsc.ts)) "
              ," ) ) / 3600 ) >= 1 "
              ,"order by dsc.ts"
            ];

        }else{
            bigquery= [
                "select len,geojson,"+propcols
              ,"FROM ( select "+subselect
              ,"  ,st_length(st_transform(snipgeom,32611)) * " + geom_utils.meters_to_miles + " as len"
              ," ,st_asgeojson(ST_Simplify(snipgeom,"+tolerance+"),"+pn+") as geojson"
              ,"  FROM ( select vdsg.* "
              ,"    ,(ST_Dump(ST_Intersection("+bbox+","+geom+"))).geom as snipgeom"
              ,"    FROM tempseg.versioned_detector_segment_geometry vdsg"
                // hack in a fix for the grid problem
                //
              ,"  join tempseg.tdetector ttd ON (vdsg.detector_id=ttd.detector_id and newtbmap.canonical_direction(vdsg.direction)=newtbmap.canonical_direction(ttd.direction) and vdsg.refnum=ttd.refnum)"
              ,"    WHERE st_intersects("+geom+","+bbox+")"
                // hack in a fix for the grid problem
                //
              ,"    AND   ttd.geom && "+bbox
              ," )pickgeom"
              ,")lengthsgeom"
              ,"JOIN tempseg.detector_segment_conditions dsc USING (components,direction)"
              ,"WHERE"
              , startend.startend
                // limit to periods of an hour or more
              ," and round ( extract( epoch from ( "
              ,"      (   LEAST  (to_timestamp(" + startend.end.getTime()/1000+"),dsc.endts)) "
              ,"    - ( GREATEST (to_timestamp("+startend.start.getTime()/1000+"),dsc.ts)) "
              ," ) ) / 3600 ) >= 1 "
              ,"order by dsc.ts"
            ];
        }
        var geoquery = bigquery.join(' ');


        console.log( bigquery.join ("\n") );

        var result = client.query(geoquery);

        //
        // features gets passed to the callback (doneGeo, aka get data)
        //
        var features=[];

        result.on('row',function(row) {
            // each row is a geometric feature
            var val = {
                "type":"Feature",
                "geometry":JSON.parse(row.geojson),
                "properties":{}
            };
            //
            // recall from above, select_properties are the things
            // I am selecting from the database.  Key value pairs
            // that get expanded as " select {key} as {value} "
            // entries in the select statement.  So here I run
            // through the select properties, and get the value,
            // which is actually the key in the response.  If this
            // were perl, I'd just iterate over select_properties
            // values, but this isn't perl...
            //
            // also
            //  You have to deep copy like this because otherwise
            //  you copy the reference, not the actual thing
            //  itself.
            //
            for (var key in select_properties){
                var value = select_properties[key];
                val.properties[value] = row[value];
            }
            // len is not in select_properties
            val.properties.len = row.len;
            val.properties.fulllen = row.fulllen;

            //
            // components is what I call the triplet that defines
            // the versioned segmentation.  The triplet is the
            // upstream detector, the detector, and the downstream
            // detector.  No matter what, this triplet should
            // always have the same geometry.  The only difference
            // is the multiplicities of times for which they are
            // active.
            //
            // As has been stated elsewhere and often, the data
            // (vehicle counts, average speeds, etc) for each
            // detector need to be applied to a segment length.
            // This step gets the segments, and the times at which
            // the segment is active.  The next step will use the
            // times and the detector id to pull data, and then
            // use the segment length to weight that data as
            // appropriate (to get VMT, etc).
            //

            features.push(val);
            // a big list of things to work on in the next step

        });

        // add an error callback to the PostgreSQL call
        result.on('error', function(err){
            console.log("request error" + JSON.stringify(err));
            next (err);
        });

        //
        // Add the next callback as the 'end' callback for the PostgreSQL call
        // call next with the geometry features that were pieced together above
        // At the moment this is the function returned by the
        // 'doneGeoQuery' function
        //
        result.on('end', function(){
            next(null,features);
            done()
        } );
        return;
    };

}

exports.geoQuery = geoQuery
