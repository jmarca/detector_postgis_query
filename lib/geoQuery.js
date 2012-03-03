/** geoQuery
*
* this provides the length of the segment, the central detector for
* the segment, and the time over which the length is active for the
* central detector.
*
**/
var global_utils=require('./globals.js');

exports.geoQuery =
    function geoQuery(bbox,startend,data,req,next){

        var pn = global_utils.precision(req.params.zoom);
        if(!pn){pn=14;}
        var overlap = 1/Math.pow(10,pn);
        var tolerance = overlap;

        return function(err, client) {
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

            var freeway_condition;
            // if(freeway_param && req.params[freeway_param]){
            //     freeway_condition = 'and refnum = '+req.params[freeway_param];
            // }

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
            if( req.params.area ){
                bigquery= [
                    "select len,geojson,"+propcols
                    ,"FROM ( select "+subselect
                    ,"  ,st_length(st_transform(snipgeom,32611)) * " + global_utils.meters_to_miles + " as len"
                    ," ,st_asgeojson(ST_Simplify(snipgeom,"+tolerance+"),"+pn+") as geojson"
                    ,"  FROM ( select "+subselect
                    ,"    ,(ST_Dump(ST_Intersection(area.geom,"+geom+"))).geom as snipgeom"
                    ,"    FROM tempseg.versioned_detector_segment_geometry"
                    ,"    join "+bbox+" ON (st_intersects(seggeom,area.geom))"
                    ,     freeway_condition
                    ," )pickgeom"
                    ,")lengthsgeom"
                    ,"JOIN tempseg.reduced_detector_segment_conditions dsc USING (components,direction)"
                    ,"WHERE"
                    , startend.startend
                    // limit to periods of an hour or more
                    ," and round ( extract( epoch from ( "
                    ,"      (   LEAST  (to_timestamp(" + startend.end.getTime()/1000+"),dsc.endts)) "
                    ,"    - ( GREATEST (to_timestamp("+startend.start.getTime()/1000+"),dsc.ts)) "
                    ," ) ) / 3600 ) >= 1 "
                    ,"order by dsc.ts limit 10000"
                ];

            }else{
                bigquery= [
                    "select len,geojson,"+propcols
                    ,"FROM ( select "+subselect
                    ,"  ,st_length(st_transform(snipgeom,32611)) * " + global_utils.meters_to_miles + " as len"
                    ," ,st_asgeojson(ST_Simplify(snipgeom,"+tolerance+"),"+pn+") as geojson"
                    ,"  FROM ( select "+subselect
                    ,"    ,(ST_Dump(ST_Intersection("+bbox+","+geom+"))).geom as snipgeom"
                    ,"    FROM tempseg.versioned_detector_segment_geometry"
                    ,"    WHERE st_intersects("+geom+","+bbox+")"
                    ,     freeway_condition
                    ," )pickgeom"
                    ,")lengthsgeom"
                    ,"JOIN tempseg.reduced_detector_segment_conditions dsc USING (components,direction)"
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
            } );
            return;
        };
    };
