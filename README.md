# Detector PostGIS Query

This module is a refactor of a program from geo_bbox.  I just want to
pull out the geographic query and make it all by itself, with tests.

# July 2016 updates

With the full-scale adoption of sqitch for the development and
processing of detector data vs OSM map data, the psql schemas and
tables need to be revised in the queries.

This package also requires deploying some database tables to your target
database.


## calvad_areas

After running `npm install`, descend into the sub-directory

'./node_modules/calvad_areas_sql' and run `sqitch deploy` to your
target database (for example, `sqitch deploy db:pg:osm`)


## fips_codes

```
cd node_modules/fips_codes/
sqitch deploy -t db:pg:osm
```

# testing

After deploying the above sqitch changes to the target database, set
up a meaninful test.config.json.  An example is

```
{
    "postgresql":{
        "host":"127.0.0.1",
        "port":5432,
        "auth":{
            "username":"dbuser"
        },
        "detector_postgis_query_db":"osm"
    }
}
```

Obviously, change the username to the correct database user account,
make sure that you have a relevant entry in your ~/.pgpass file,
and/or insert an "auth:password:" field, and then hide the config file
from other users with:

```
chmod 0600 test.config.json
```

Then run the tests:



```
npm test
```

If you get an immediate fail, make sure that the permissions to the
database are correct, and that you actually have deployed the
necessary tables to that database.
