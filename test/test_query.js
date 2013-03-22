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
var geoQuery = require('../lib/geoQuery').geoQuery
var pg = require('pg')

describe('geoQuery',function(){
    var app,server;
    before(function(done){
        // set up a small express server so I don't have to mock up request objects
        function handler(req,res,next){

            var doGeo = geoQuery(req,function(err,features){
                            if(err) return next(err)
                            res.json(features)
                            return res.end()
                        })
            var osmConnectionString = "pg://"+puser+":"+ppass+"@"+phost+":"+pport+"/osm";
            pg.connect(osmConnectionString, doGeo);
        }
        app = express()
        app.get('/zcr/:year/:zoom/:column/:row.:format'
               ,handler)
        app.get('/:area/:aggregate/:year/:areaid.:format'
               ,handler)
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


})
