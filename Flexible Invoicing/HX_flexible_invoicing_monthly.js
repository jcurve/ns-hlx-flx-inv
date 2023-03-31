/**
 *@NApiVersion 2.1
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
    './util/HX_flexible_invoice_util.js',
    './util/moment.js'
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
        util,
        moment) {

        var scriptObj = runtime.getCurrentScript();
        var SO_SEARCHID = util.SEARCHID().SOMONTHLY_SRCH_ID;

        function getInputData(context) {

            //Determine Execution Day
            var param = util.SCRIPTPARAMS().ISTESTING;
            var isValidDay = util.validExecutionDay(param, 'MONTHLY');
             if (!isValidDay) {
                log.debug({
                    title: 'isValidDay',
                    details: 'Do Not Run Today'
                });
                return null;
            }

            //Retrieve Records to Process
            var fltrs = {};
            var results = util.loadSearch(SO_SEARCHID, null, fltrs); // SearchID, RecordType, filters

            if (util.isEmpty(results)) {
                log.debug({
                    title: 'results empty',
                    details: results
                });

                return null;
            }

            results = FormatResults(results);
            /**/
            log.debug({
                title: '*** formatted results',
                details: JSON.stringify(results)
            });
            /**/
            return results;
        }

        function FormatResults(results) {
            try {
                var obj = {};
                var cols = util.getSearchColumns(SO_SEARCHID, null);
                var jsonCols = util.MONTHLYSEARCHCOLS();
                for (each in results) {
                    var rec = results[each];
                    var soId = rec.getValue('internalid');
                    var tranid = rec.getValue('tranid');
                    var subsId = util.getColumnValue(rec, cols, jsonCols.subsId);
                    var custName = util.getColumnValue(rec, cols, jsonCols.custName);
                    var custId = util.getColumnValue(rec, cols, jsonCols.custId);
                    var lineId = util.getColumnValue(rec, cols, jsonCols.lineId);
                    var itemId = util.getColumnValue(rec, cols, jsonCols.itemId);
                    var amt = util.getColumnValue(rec, cols, jsonCols.amt);
                    var qty = util.getColumnValue(rec, cols, jsonCols.qty);
                    var qtyBilled = util.getColumnValue(rec, cols, jsonCols.qtyBilled);
                    var type = util.getColumnValue(rec, cols, jsonCols.type);
                    var acd = util.getColumnValue(rec, cols, jsonCols.acd);


                    log.debug('Results', 'soId=' + soId + '; tranid=' + tranid + '; subsId=' + subsId + '; custName=' + custName +
                        '; custId=' + custId + '; lineId=' + lineId + '; itemId=' + itemId + '; amt=' + amt + '; qty=' + qty + '; qtyBilled=' + qtyBilled +
                        '; type=' + type + '; acd=' + acd + '; ');

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

                log.debug({
                    title: '*** obj',
                    details: JSON.stringify(obj)
                });

                var newObj = {};
                var cnt = 1;
                for (var soId in obj) {

                    log.debug({
                        title: '*** soId',
                        details: JSON.stringify(soId)
                    });


                    var byType = obj[soId];
                    for (type in byType) {


                        log.debug({
                            title: '*** type',
                            details: JSON.stringify(type)
                        });

                        if (util.isEmpty(type)) continue;
                        if (type.toUpperCase() == 'PRORATED') {

                            log.debug({
                                title: '*** inside prorated'
                            });
                            log.debug({
                                title: '*** byType[type]',
                                details: JSON.stringify(byType[type])
                            });
                            var groupObj = byType[type];
                            var arr = [];
                            if (newObj[cnt] === undefined)
                                newObj[cnt] = [{}];

                            for (var line in groupObj) {
                                log.debug({
                                    title: '*** groupObj[line]',
                                    details: JSON.stringify(groupObj[line])
                                });

                                arr.push(groupObj[line]);
                            }
                            newObj[cnt] = arr;
                            cnt++;
                        } else if (type.toUpperCase() == 'REGULAR') {

                            log.debug({
                                title: '*** inside regular'
                            });

                            var groupObj = byType[type];

                            if (newObj[cnt] === undefined)
                                newObj[cnt] = {};

                            newObj[cnt] = groupObj;
                            cnt++;
                        }
                    }
                }

                return newObj;
            } catch (ex) {
                log.debug({
                    title: 'FormatResults Ex',
                    details: ex
                });
            }
        }

        function map(context) {
            try {
                var objVals = JSON.parse(context.value);
                log.debug('map', context.key + ' : ' + JSON.stringify(objVals));

                log.debug({
                    title: '*** about to create invoice'
                });

                CreateInvoice(objVals);

            } catch (ex) {
                log.debug({
                    title: 'map Ex',
                    details: ex
                });
            }
        }

        function CreateInvoice(objVals) {
            // var objDate = {
            //     "Jan":"01";
            //     "Feb":"02";
            //     "Mar":"03;
            //     "Apr":"04;
            //     "May":"05;
            //     "Jun":"06",

            //     "JUL", "AUG", "SEPT", "OCT", "NOV", "DEC"
            // };

            try {
                log.debug({
                    title: '*** inside create invoice'
                });
                var soId = objVals[0].soId;

                var invRec = record.transform({
                    fromType: record.Type.SALES_ORDER,
                    fromId: soId,
                    toType: record.Type.INVOICE,
                    isDynamic: true
                });
                var recLines = invRec.getLineCount({
                    sublistId: 'item'
                });

                var objValsCnt = objVals.length;
                var lineIdsToProcess = [];

                //determine which lines to be invoiced.
                for (each in objVals) {
                    var lineId = objVals[each].lineId;
                    lineIdsToProcess.push(parseInt(lineId));
                }

                log.debug({ title: 'id: ' + soId, details: 'lineIdsToProcess: ' + lineIdsToProcess });

                //remove unnecessary lines from new Invoice
                var idx = 0;
                var type = null;
                var trandate = null;
                var revisedAmtObject = util.rateRevisionLookupMonth(soId);
                log.debug("revisedAmtObject", revisedAmtObject);
                for (var z = 0; z < recLines; z++) {
                    var recLineId = invRec.getSublistValue({
                        sublistId: 'item',
                        fieldId: 'line',
                        line: idx
                    });

                    if (lineIdsToProcess.indexOf(parseInt(recLineId)) == -1) {
                        invRec.removeLine({
                            sublistId: 'item',
                            line: idx
                        });

                        log.debug({ title: 'removing', details: 'id: ' + soId + ', line: ' + recLineId });
                    } else {

                        //Determine if Prorated or Regular
                        var rate = null;
                        var acd = null;
                        var itemId = null;
                        var revisedAmt = null;
                        var qty = null;
                        for (each in objVals) {
                            var lineId = objVals[each].lineId;
                            if (lineId != recLineId) continue;

                            acd = objVals[each].acd;
                            type = objVals[each].type;
                            itemId = objVals[each].itemId;
                            qty = objVals[each].qty || 0;

                            /**BEGIN Invoice Rate Revision Lookup */
                            if (type.toUpperCase() == 'REGULAR') {
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

                            log.debug({ title: 'so, lineId, rateDate', details: soId + ',' + lineId + ',' + rateDate });
                            log.debug("type of rateDate ", typeof (rateDate));
                            if (revisedAmtObject.length > 0) {
                                var revisedAmtValue = revisedAmtObject.filter(x => x.lineId == lineId && ((isCheckDateBetwenTwoDate(rateDate, x.startDate, x.endDate)) || (isCheckDateMoreThanDate(rateDate, x.startDate) && !x.endDate)));
                                if (revisedAmtValue.length == 0) {
                                    revisedAmt = 0
                                }
                                else {
                                    revisedAmt = revisedAmtValue[0].revisedAmt
                                }

                            }
                            else {
                                revisedAmt = 0

                            }


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
                            if (qty) {
                                log.debug({
                                    title: 'w/ qty: ' + soId,
                                    details: qty
                                });
                                rate = calculateRate(objVals[each], revisedAmt);
                            } else {
                                // log.debug({
                                //     title: 'no qty: ' + util.rateRevisionLookup(soId, lineId, rateDate),
                                //     details: qty
                                // });
                                // rate = util.rateRevisionLookup(soId, lineId, rateDate)
                            }

                            trandate = acd;
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

                        log.debug({
                            title: 'soId: ' + soId,
                            details: 'type: ' + type + ', recLineId: ' + recLineId + ', rate: ' + rate + ', trandate: ' + trandate
                        });

                        invRec.selectLine({
                            sublistId: 'item',
                            line: idx
                        });

                        if (qty) {
                            invRec.setCurrentSublistValue({
                                sublistId: 'item',
                                fieldId: 'quantity',
                                value: 1,
                                ignoreFieldChange: true
                            });
                        }

                        if (type.toUpperCase() == 'REGULAR') {
                            if (!util.isEmpty(revisedAmt)) {
                                rate = revisedAmt;
                                invRec.setCurrentSublistValue({
                                    sublistId: 'item',
                                    fieldId: 'rate',
                                    value: rate,
                                    ignoreFieldChange: true
                                });
                            } else {
                                rate = invRec.getCurrentSublistValue({
                                    sublistId: 'item',
                                    fieldId: 'rate',
                                });
                            }
                        }

                        if (type.toUpperCase() == 'PRORATED') {
                            if (!util.isEmpty(revisedAmt)) {
                                invRec.setCurrentSublistValue({
                                    sublistId: 'item',
                                    fieldId: 'rate',
                                    value: rate,
                                    ignoreFieldChange: true
                                });
                            } else {
                                rate = invRec.getCurrentSublistValue({
                                    sublistId: 'item',
                                    fieldId: 'rate',
                                });
                            }
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
                    var recUpdate =record.load({
                        type: 'invoice',
                        id:  invRec.id,
                    })
                    var createDate=recUpdate.getValue('createddate');
                    var formatteddatetime =  format.format({
                        value: createDate,
                        type: format.Type.DATE
                    });
                    var firstDay = moment(formatteddatetime).startOf('month').format('D-MMM-YYYY');
                    log.debug("firstDay", firstDay);
                    firstDay = format.parse({value:firstDay , type: format.Type.DATE});
                    recUpdate.setValue('trandate',firstDay);
                    var recUpdateid=recUpdate.save();
                    log.debug("recUpdateid",recUpdateid);

                } catch (exsave) {
                    log.debug({
                        title: 'CreateInvoice inner ex',
                        details: exsave
                    });
                }

            } catch (ex) {
                log.debug({
                    title: 'CreateInvoice Ex',
                    details: ex
                });
            }
        }

        /****
         * @objVal - array 
         * @revisedAmt - float or null. 
         */
        function calculateRate(objVal, revisedAmt) {
            try {
                var amt = 0.00;
                log.debug({
                    title: 'objVal',
                    details: JSON.stringify(objVal)
                });
                if (util.isEmpty(revisedAmt))
                    amt = objVal.amt;
                else
                    amt = revisedAmt;

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

                var consumedDays = ((daysInMonth - day)) + 1;
                var rate = parseFloat(dailyRate) * consumedDays;
                return parseFloat(rate).toFixed(2);

            } catch (ex) {
                log.debug({
                    title: 'calculateRate Ex',
                    details: ex
                });
            }
        }
        function isCheckDateBetwenTwoDate(trandate, startDate, endDate) {
            if (!trandate || !startDate || !endDate) {
                return false;
            }
            var from = new Date(startDate);
            var to = new Date(endDate);
            var check = new Date(trandate);
            if (check >= from && check <= to) {
                return true;
            }
            else {
                return false;
            }
        }
        function isCheckDateMoreThanDate(trandate, startDate) {
            if (!trandate || !startDate) {
                return false;
            }
            var from = new Date(startDate);
            var check = new Date(trandate);
            if (check >= from) {
                return true;
            }
            else {
                return false;
            }
        }

        function reduce() {

        }

        function summarize() {

        }

        return {
            getInputData: getInputData,
            map: map,
            reduce: reduce,
            summarize: summarize
        }
    }
);