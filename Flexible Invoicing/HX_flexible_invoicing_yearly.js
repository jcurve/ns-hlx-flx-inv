/**
 *@NApiVersion 2.0
 *@NScriptType MapReduceScript
 */

define([
    'N/record',
    'N/file',
    'N/log',
    'N/transaction',
    'N/render',
    'N/runtime',
    'N/search',
    'N/task',
    'N/format',
    'N/email',
    'N/error',
    './util/HX_flexible_invoice_util.js'
    ],
    
    function (
    record,
    file,
    log,
    transaction,
    render,
    runtime,
    search,
    task,
    format,
    email,
    error,
    util){
    
        var scriptObj = runtime.getCurrentScript();
        var SO_SEARCHID = util.SEARCHID().SOYEARLY_SRCH_ID;
        var dummyDate = scriptObj.getParameter({name: 'custscript_flex_inv_dummy_date_yearly'});
        function getInputData(context){

            //Determine Execution Day
            var param = util.SCRIPTPARAMS().YEARLY_TESTING;
            
            var isValidDay = util.validExecutionDay(param,'YEARLY',dummyDate);
            if (!isValidDay){
                log.debug({
                    title : 'isValidDay',
                    details : 'Do Not Run Today'
                });
                return null;
            }
    
            //Retrieve Records to Process
            var fltrs = {};
            var results = util.loadSearch(SO_SEARCHID, null, fltrs); // SearchID, RecordType, filters
    
            if (util.isEmpty(results)){
                log.debug({
                    title : 'results empty',
                    details : results
                });
    
                return null;
            }
    
            results =  FormatResults(results);
            /*
            log.debug({
                title : 'formatted results',
                details : JSON.stringify(results)
            });
            */
            return results;
        }
    
        function GetYearDays(currDate){
        try{
            //Get inclusive months of current quarter                   
            
            var currMonth = currDate.getMonth();
            var currDay = currDate.getDate();
            var currYear = currDate.getFullYear();
            
            /*
            log.debug({
                title : 'currDate:'+currDate,
                details : currMonth+' '+currDay+' '+currYear
            });
            */

            //determine number of days during the previous year
            var currYear = currDate.getFullYear();
            var prevYear = currYear - 1;
            var daysOfMos = util.DAYSOFMONTH(util.isLeapYear(currYear-1));
            var totalDays = 0;
            for (dd in daysOfMos){
                totalDays+= parseInt(daysOfMos[dd]);
            }

            /*
            log.debug({
                title : 'totalDays',
                details : totalDays
            });
            */

            var obj = {};
            obj.totalDays = totalDays;
            return obj;
        }catch (ex){
        log.debug({
            title : 'GetYearDays Ex',
            details : ex
        });
        }
        }
    
        function FormatResults(results){
        try{
            var obj = {};
            var cols = util.getSearchColumns(SO_SEARCHID, null);
            var jsonCols = util.MONTHLYSEARCHCOLS();
            for (each in results){
                var rec = results[each];
                var soId = rec.getValue('internalid');
                var tranid = rec.getValue('tranid');
                var subsId = util.getColumnValue(rec,cols,jsonCols.subsId);
                var custName = util.getColumnValue(rec,cols,jsonCols.custName); 
                var custId = util.getColumnValue(rec,cols,jsonCols.custId); 
                var lineId = util.getColumnValue(rec,cols,jsonCols.lineId); 
                var itemId = util.getColumnValue(rec,cols,jsonCols.itemId); 
                var amt = util.getColumnValue(rec,cols,jsonCols.amt); 
                var qty = util.getColumnValue(rec,cols,jsonCols.qty); 
                var qtyBilled = util.getColumnValue(rec,cols,jsonCols.qtyBilled); 
                var type = util.getColumnValue(rec,cols,jsonCols.type);  
                var acd = util.getColumnValue(rec,cols,jsonCols.acd); 
    
                var jsonRec = {};               
                jsonRec.soId = soId;
                jsonRec.subsId = subsId;
                jsonRec.custId = custId;
                jsonRec.lineId = lineId;
                jsonRec.itemId = itemId;
                jsonRec.amt = amt;
                jsonRec.qty = qty;
                jsonRec.qtyBilled = qtyBilled;
                jsonRec.type = type;
                jsonRec.acd = acd;

                if (obj[soId] == undefined)
                    obj[soId] = {};
    
                if (obj[soId][type] == undefined)
                    obj[soId][type] = [];
    
                obj[soId][type].push(jsonRec);
            }
    
            var newObj = {};
            var cnt = 1;
            for (var soId in obj){
                var byType = obj[soId];
                for (type in byType){
                    if (util.isEmpty(type)) continue;
                    if (type.toUpperCase() == 'PRORATED'){
                        var groupObj = byType[type];
                        for (var line in groupObj ){
    
                            if (newObj[cnt] === undefined)
                                newObj[cnt] = {};
    
                            var arr = [];
                            arr.push(groupObj[line]);
                            newObj[cnt] = arr;
                            cnt++;
                        }                    
                    }else if (type.toUpperCase() == 'REGULAR'){
                        var groupObj = byType[type];
    
                        if (newObj[cnt] === undefined)
                                newObj[cnt] = {};
    
                            newObj[cnt] = groupObj;
                            cnt++;
                    }
                }            
            }
    
            return newObj;
        }catch (ex){
        log.debug({
            title : 'FormatResults Ex',
            details : ex
        });
        }
        }
    
        function map(context){
        try{
            var objVals = JSON.parse(context.value);
            log.debug('map', context.key + ' : ' + JSON.stringify(objVals));
    
            CreateInvoice(objVals);
    
        }catch (ex){
        log.debug({
            title : 'map Ex',
            details : ex
        });
        }
        }
    
        function CreateInvoice(objVals){
        try{
            
            if (util.isEmpty(dummyDate))
            {
                var tempdate = new Date();
                var dateNow = util.getLocalDate(tempdate);
            }else{
                var dateNow = dummyDate; //Place a comment after development.
            }
            
            dateNow = format.parse({
                value: dateNow,
                type: format.Type.DATE
                });

            var objPrevYr = GetYearDays(dateNow);
    
            var soId = objVals[0].soId;
            var invRec = record.transform({
                fromType: record.Type.SALES_ORDER,
                fromId: soId,
                toType: record.Type.INVOICE,
                isDynamic : true
            });
    
            var recLines = invRec.getLineCount({
                sublistId: 'item'
            });
    
            var objValsCnt = objVals.length;
            var lineIdsToProcess = [];
    
            //determine which lines to be invoiced.
            for (each in objVals){
                var lineId = objVals[each].lineId;
                lineIdsToProcess.push(parseInt(lineId));
            }
    
           // log.debug({ title: 'id: '+soId,  details: 'lineIdsToProcess: ' + lineIdsToProcess  });
            
            //remove unnecessary lines from new Invoice
            var idx = 0;            
            var type =  null;
            var trandate = null;
            for (var z=0; z<recLines; z++){
                var recLineId = invRec.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'line',
                    line: idx
                });
    
                if (lineIdsToProcess.indexOf(parseInt(recLineId))==-1){
                    invRec.removeLine({
                        sublistId: 'item',
                        line:  idx
                    });
    
                   // log.debug({ title: 'removing',details: 'id: '+soId+', line: ' + recLineId});
                }else{

                    //Determine if Prorated or Regular
                    var rate = null;
                    var acd = null;
                    var itemId = null;
                    var revisedAmt = null;
                    
                    for (jj in objVals){
                        var lineId = objVals[jj].lineId;
                        if (lineId != recLineId) continue;

                        acd = objVals[jj].acd;
                        type = objVals[jj].type;                        
                        itemId = objVals[jj].itemId;

                        /**BEGIN Invoice Rate Revision Lookup */
                        if (type.toUpperCase() == 'REGULAR'){
                            if (util.isEmpty(dummyDate)){
                                var date = new Date();
                            }else{
                                var date = dummyDate;
                            }
                            
                            var rateDate = util.getLocalDate(date);    
                            rateDate = format.format({
                                value: rateDate,
                                type: format.Type.DATE
                                });

                            rateDate = rateDate.split(' ')[0];
                        }else{
                            var rateDate = acd;
                        }

                        log.debug({ title: 'so, lineId, rateDate', details: soId+','+lineId+','+rateDate });
                        
                        revisedAmt = util.rateRevisionLookup(soId,lineId,rateDate);                        

                        /**Capture Invoice Trandate for REGULAR*/
                        if (type.toUpperCase() == 'REGULAR' || util.isEmpty(type)) {
                            if (util.isEmpty(dummyDate))
                                var date = new Date();
                            else
                                var date = dummyDate;
                            date = format.parse({
                                value: date,
                                type: format.Type.DATE
                                });

                            trandate = new Date(date.getFullYear(), date.getMonth(), 1);
                            trandate = format.parse({
                                value: trandate,
                                type: format.Type.DATE
                            });
                            break;
                        }
                        /**END Capture of Trandate for REGULAR*/

                        /**Capture Invoice Trandate and Rate for PRORATED*/
                        log.debug({title: 'objVals[jj]',details: objVals[jj]});
                        rate = calculateRate(objVals[jj],revisedAmt,dateNow,objPrevYr);

                        trandate = objVals[jj].acd;
                        trandate = format.parse({
                            value: trandate,
                            type: format.Type.DATE
                        });

                        invRec.setCurrentSublistValue({
                            sublistId: 'item',
                            fieldId: 'rate',
                            value: rate,
                            ignoreFieldChange: true
                        });

                        break;
                        /**END Capture Invoice Trandate and Rate for PRORATED*/
                    }


                    log.debug({ title: 'soId: '+soId,
                                    details : 'type: '+type+', recLineId: '+recLineId+', rate: ' + rate+', trandate: ' + trandate
                                });

                    invRec.selectLine({
                        sublistId: 'item',
                        line: idx
                    });

                    invRec.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'quantity',
                        value: 1,
                        ignoreFieldChange: true
                    });

                    if (type.toUpperCase() == 'REGULAR'){
                        if (!util.isEmpty(revisedAmt)){
                            rate = revisedAmt;
                            invRec.setCurrentSublistValue({
                                sublistId: 'item',
                                fieldId: 'rate',
                                value: rate,
                                ignoreFieldChange: true
                            });
                        }else{
                            rate = invRec.getCurrentSublistValue({
                                sublistId: 'item',
                                fieldId: 'rate',
                            });
                        }
                    }

                    if (type.toUpperCase() == 'PRORATED'){
                        invRec.setCurrentSublistValue({
                            sublistId: 'item',
                            fieldId: 'rate',
                            value: rate,
                            ignoreFieldChange: true
                        });
                    }
                    
                    invRec.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'amount',
                        value: rate,
                        ignoreFieldChange: true
                    });

                    invRec.commitLine({
                        sublistId: 'item'
                    });

                    //log.debug({ title: 'setSublistValue',details: 'id: '+soId+', quantity: ' + 1});
                    
                    idx++;
                }
            }
            
            invRec.setValue({
                fieldId: 'trandate',
                value: trandate,
                ignoreFieldChange: false
            });
            
            try {
                invRec.save();
                var invId = invRec.id;
                log.debug({
                    title: 'CreateInvoice Success',
                    details: 'id: ' + invId
                });
    
            } catch (exsave) {
                log.debug({
                    title: 'CreateInvoice inner ex',
                    details: exsave
                });
            }        
    
        }catch (ex){
        log.debug({
            title : 'CreateInvoice Ex',
            details : ex
        });
        }
        }

        /****
         * @objVal - array 
         * @revisedAmt - float or null.
         * @currDate - current local date object
         * @objPrevYr - object containing previous year number of days
         */
		function calculateRate(objVal,revisedAmt,currDate,objPrevYr){
        try{           
            
            var totalDays = objPrevYr.totalDays;
            var currYear = currDate.getFullYear();
            var prevYear = currYear - 1;
              
            var yearEndDate = new Date(prevYear, 11+1, 0);
            yearEndDate = format.parse({
                value: yearEndDate,
                type: format.Type.DATE
                });

            //compute daily rate
            if (util.isEmpty(revisedAmt))
                var amt = objVal.amt;
            else
                var amt = revisedAmt;
                
            var acDate = format.parse({
                    value: objVal.acd,
                    type: format.Type.DATE
                });

            var dailyRate = parseFloat(amt) / parseInt(totalDays);
            var daysDiff = util.DAYSDIFF(yearEndDate,acDate);
            var consumedDays = Math.abs(daysDiff)+1;            
            
            log.debug({
                title : 'calculateRate',
                details : 
                            'amt: '+amt+
                            ', totalDays: '+totalDays+
                            ', dailyRate: '+dailyRate+
                            ', daysDiff: ' +daysDiff+
                            ', consumedDays: '+consumedDays+
                            ', yearEndDate: '+yearEndDate
            });
                        
            var rate = parseFloat(dailyRate) * consumedDays.toFixed();
            return parseFloat(rate).toFixed(2);

        }catch (ex){
            log.debug({
                title : 'calculateRate Ex',
                details : ex
            });
        }
        }
    
        function reduce(){
    
        }
    
        function summarize(){
    
        }
    
        return {
            getInputData : getInputData,
            map : map,
            reduce : reduce,
            summarize : summarize
        }
    }
    );