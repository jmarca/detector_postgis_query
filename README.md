# Detector PostGIS Query

This module is a refactor of a program from geo_bbox.  I just want to
pull out the geographic query and make it all by itself, with tests.

# July 2016 updates

With the full-scale adoption of sqitch for the development and
processing of detector data vs OSM map data, the psql schemas and
tables need to be revised in the queries.

This package also requires deploying the areas tables to your target
database.

After running `npm install`, descend into the sub-directory

'./node_modules/calvad_areas_sql' and run `sqitch deploy` to your
target database (for example, `sqitch deploy db:pg:osm`)

After that, run

npm test
