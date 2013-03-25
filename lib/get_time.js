/* global exports */

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

exports.get_time=get_time;
