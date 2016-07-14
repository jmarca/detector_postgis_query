/* global require console process it describe after before */

var should = require('should')

var env = process.env;
var puser = env.PSQL_USER ;
var ppass = env.PSQL_PASS ;
var phost = env.PSQL_HOST ;
var pport = env.PSQL_PORT || 5432;

var express = require('express')
var http = require('http')
var testport = env.TEST_PORT || 3000
var testhost = env.TEST_HOST || '127.0.0.1'
var _ = require('lodash')

var superagent = require('superagent')
var geoQuery = require('../.').geoQuery
var pg = require('pg')

var config_okay = require('config_okay')
var path = require('path')
var rootdir = path.normalize(process.cwd())
var config_file = rootdir+'/test.config.json'

var config

before(function(done){
    config_okay(config_file,function(err,c){
        config ={'postgresql':c.postgresql
                ,'couchdb':c.couchdb}

        return done()
    })
    return null
})

describe('geoQuery',function(){
    var app,server;
    before(function(done){
        var host = config.postgresql.host ? config.postgresql.host : '127.0.0.1';
        var user = config.postgresql.auth.username ? config.postgresql.auth.username : 'myname';
        var pass = config.postgresql.auth.password ? config.postgresql.auth.password : '';
        var port = config.postgresql.port ? config.postgresql.port :  5432;
        var db  = config.postgresql.detector_postgis_query_db ? config.postgresql.detector_postgis_query_db : 'detector_postgis_query_db'
        var connectionString = "pg://"+user+":"+pass+"@"+host+":"+port+"/"+db
        // set up a small express server so I don't have to mock up request objects
        function handler(req,res,next){
            var doGeo = geoQuery(req,{},function(err,features){
                            if(err){
                                return next(err)
                            }
                            res.json(features)
                            return res.end()
                        })
            pg.connect(connectionString, function(e,client,done){
                if(e){
                    throw new Error(e)

                }
                return doGeo(e,client,done);

            })
        }
        function handler2(req,res,next){

            var doGeo = geoQuery(req
                                ,{'area_type_param':'area'
                                 ,'area_param':'areaid'}
                                ,function(err,features){
                            if(err){
                                return next(err)
                            }
                            res.json(features)
                            return res.end()
                                })
            pg.connect(connectionString, function(e,client,done){
                if(e){
                    throw new Error(e)

                }
                return doGeo(e,client,done);

            })

        }
        function handler3(req,res,next){

            var doGeo = geoQuery(req
                                ,{'area_type_param':'gumby'
                                 ,'area_param':'dammit'}
                                ,function(err,features){
                            if(err){
                                return next(err)
                            }
                            res.json(features)
                            return res.end()
                        })
            pg.connect(connectionString, function(e,client,done){
                if(e){
                    throw new Error(e)

                }
                return doGeo(e,client,done);

            })

        }
        app = express()
        app.get('/zcr/:year/:zoom/:column/:row.:format'
               ,handler)
        app.get('/zcr2/:year/:zoom/:column/:row.:format'
               ,handler2)
        app.get('/:area/:aggregate/:year/:areaid.:format'
               ,handler2)
        app.get('/h3/:gumby/:aggregate/:year/:dammit.:format'
               ,handler3)
        server=http
               .createServer(app)
               .listen(testport,testhost,done)
    })
    after(function(done){
        server.close(done)
    })

    it('should get vds data in an area'
      ,function(done){
           superagent.get('http://'+ testhost +':'+testport+'/counties/monthly/2007/06059.json')
           .set({'accept':'application/json'
                ,'followRedirect':true})
           .end(function(e,r){
               if(e) return done(e)
               r.should.have.status(200)
               var c = r.body
               c.should.have.property('length')
               c.length.should.be.above(1000)
               var vds_re = /vdsid/;
               var wim_re = /wim/;
               var has_vds = _.some(c
                                   ,function(feature){
                                        return vds_re.test(feature.properties.detector_id)
                                    })
               has_vds.should.be.true
               var has_wim = _.some(c
                                   ,function(feature){
                                        return wim_re.test(feature.properties.detector_id)
                                    })
               has_wim.should.be.true


               return done()
           })

       })

    it('should get vds data in an area'
      ,function(done){
           superagent.get('http://'+ testhost +':'+testport+'/h3/counties/monthly/2007/06059.json')
           .set({'accept':'application/json'
                ,'followRedirect':true})
           .end(function(e,r){
               if(e) return done(e)
               r.should.have.status(200)
               var c = r.body
               c.should.have.property('length')
               c.length.should.be.above(1000)
               var vds_re = /vdsid/;
               var wim_re = /wim/;
               var has_vds = _.some(c
                                   ,function(feature){
                                        return vds_re.test(feature.properties.detector_id)
                                    })
               has_vds.should.be.true
               var has_wim = _.some(c
                                   ,function(feature){
                                        return wim_re.test(feature.properties.detector_id)
                                    })
               has_wim.should.be.true


               return done()
           })

       })

    it('should spit out vds links in a bbox defined by zoom, column, row'
      ,function(done){
           // load the service for vds shape data
           superagent.get('http://'+ testhost +':'+testport+'/zcr/2007/14/2821/6558.json')
           .set({'accept':'application/json'
                ,'followRedirect':true})
           .end(function(e,r){
               if(e) return done(e)
               r.should.have.status(200)
               var c = r.body
               c.should.have.property('length',11)

               return done()
           })
       })
    it('should spit out vds links in a bbox defined by zoom, column, row, with area handler too'
      ,function(done){
           // load the service for vds shape data
           superagent.get('http://'+ testhost +':'+testport+'/zcr2/2007/14/2821/6558.json')
           .set({'accept':'application/json'
                ,'followRedirect':true})
           .end(function(e,r){
               if(e) return done(e)
               r.should.have.status(200)
               var c = r.body
               c.should.have.property('length',11)

               return done()
           })
       })


})
