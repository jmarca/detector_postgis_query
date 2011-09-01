var dirs = require('./mkdir_p');

var path = '/home/james/repos/jem/node-data-proxy/public/data/airbasins/monthly/2007';
dirs.makeDir(path
            ,function(err){
                if(err){
                    console.log('error making'+ path+ ' :'+ JSON.stringify(err));
                }else{
                    console.log('made'+ path) ;
                }
            });

