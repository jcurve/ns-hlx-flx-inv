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
        var SO_SEARCHID = util.SEARCHID().CATCHUP_MONTHLY_SRCH_ID;
       
        function getInputData(context){
           
            //Determine Execution Day
            var param = util.SCRIPTPARAMS().MONTHLYCATCHUP_TESTING;
            var isValidDay = util.validExecutionDay(param,'MONTHLYCATCHUP');
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
                var catchupType = util.getColumnValue(rec,cols,14);
    
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
                jsonRec.catchupType = catchupType;

                if (obj[soId] == undefined)
                    obj[soId] = {};
    
                if (obj[soId][catchupType] == undefined)
                    obj[soId][catchupType] = [];
    
                obj[soId][catchupType].push(jsonRec);
            }
    
            var newObj = {};
            var cnt = 1;
            for (var soId in obj){
                var byType = obj[soId];
                for (catchupType in byType){
                    if (util.isEmpty(catchupType)) continue;
                    if (catchupType.toUpperCase() == 'PRORATED'){
                        var groupObj = byType[catchupType];
                        for (var line in groupObj ){
    
                            if (newObj[cnt] === undefined)
                                newObj[cnt] = {};
    
                                log.debug({
                                    title : 'PRORATED',
                                    details : catchupType
                                });

                            var arr = [];
                            arr.push(groupObj[line]);
                            newObj[cnt] = arr;
                            cnt++;
                        }
                    }else {
                        log.debug({
                            title : 'PRORATED AND REG TEST',
                            details : catchupType
                        });
                        var groupObjPro = JSON.stringify(byType[catchupType]);
                        var groupObjProReg = JSON.stringify(byType[catchupType]);

                        groupObjPro = JSON.parse(groupObjPro);
                        groupObjProReg = JSON.parse(groupObjProReg);
    
                        //insert prorated object
                        if (newObj[cnt] === undefined){
                                newObj[cnt] = {};
                            
                            for (xx in groupObjPro){
                                groupObjPro[xx].type = 'PRORATED';
                            }
                            
                            newObj[cnt] = groupObjPro;
                            cnt++;
                        }

                        //insert regular object
                        if (newObj[cnt] === undefined){
                                newObj[cnt] = {};

                            for (xx in groupObjProReg){
                                groupObjProReg[xx].type = 'REGULAR';
                            }

                            newObj[cnt] = groupObjProReg;
                            cnt++;
                        }
                    }
                }
            }
            
            log.debug({
                title : 'FormatResults newObj',
                details : newObj
            });
    
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
                    var catchupType = null;
                    for (each in objVals){
                        var lineId = objVals[each].lineId;
                        if (lineId != recLineId) continue;

                        acd = objVals[each].acd;
                        type = objVals[each].type;                        
                        itemId = objVals[each].itemId;
                        catchupType = objVals[each].catchupType;

                        /**BEGIN Invoice Rate Revision Lookup */
                        if (type.toUpperCase() == 'REGULAR'){
                            var date = new Date();
                            rateDate = util.getLocalDate(date);    
                            rateDate = format.format({
                                value: rateDate,
                                type: format.Type.DATE
                                });
                            
                            rateDate = rateDate.split(' ')[0];
                        }
                        else
                            var rateDate = acd;

                        log.debug({ title: 'so, lineId, rateDate', details: soId+','+lineId+','+rateDate });
                        
                        revisedAmt = util.rateRevisionLookup(soId,lineId,rateDate);

                        //return; //alisin mo to pag magpoproceed to create INV

                        /**Capture Invoice Trandate for REGULAR*/
                        if (type.toUpperCase() == 'REGULAR' || util.isEmpty(type)) {
                            var date = new Date();
                            trandate = new Date(date.getFullYear(), date.getMonth(), 1);
                            trandate = format.parse({
                                value: trandate,
                                type: format.Type.DATE
                            });
                            break;
                        }
                        /**END Capture of Trandate for REGULAR*/

                        /**Capture Invoice Trandate and Rate for PRORATED*/
                        rate = calculateRate(objVals[each],revisedAmt);

                        trandate = objVals[each].acd;
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
         */
		function calculateRate(objVal,revisedAmt){
        try{
            if (util.isEmpty(revisedAmt))
                var amt = objVal.amt;
            else
                var amt = revisedAmt;
                
            var acDate = format.parse({
                    value: objVal.acd,
                    type: format.Type.DATE
                });
            var year = acDate.getFullYear();
            var month = acDate.getMonth();
            var day = acDate.getDate();
            var daysOfMos = util.DAYSOFMONTH(util.isLeapYear(year));
            var daysInMonth = daysOfMos[month];           

            var dailyRate = parseFloat(amt) / parseInt(daysInMonth);
            
            /*
            log.debug({
                title : 'calculateRate',
                details : 
                            'amt: '+amt+
                            ' daysInMonth: '+daysInMonth+
                            ' dailyRate: '+dailyRate
            });
            */

            var consumedDays = ((daysInMonth-day))+1;
            var rate = parseFloat(dailyRate) * consumedDays;
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