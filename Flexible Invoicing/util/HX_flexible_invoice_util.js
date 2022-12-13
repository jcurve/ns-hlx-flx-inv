/**
* Library
*/

//GLOBAL
var CUSTOM_SO_TRANS = 'CuTrSale106';
define([
	'N/record',
	'N/log',
	'N/transaction',
	'N/search',
	'N/format',
	'N/runtime'],
	Main);

function Main(
	record,
	log,
	transaction,
	search,
	format,
	runtime) {

	var scriptObj = runtime.getCurrentScript();

	function SEARCHID() {
		var obj = {};
		obj.SOMONTHLY_SRCH_ID = 'customsearch_flexible_inv_monthly';
		obj.SOQUARTERLY_SRCH_ID = 'customsearch_flexible_inv_quarterly';
		obj.SOYEARLY_SRCH_ID = 'customsearch_flexible_inv_yearly';
		obj.CATCHUP_MONTHLY_SRCH_ID = 'customsearch_flexible_inv_mon_catchup';
		return obj;
	}

	/**
	* id : searchid
	* type : recordtype
	* fltrs : search filters array
	*/
	function loadSearch(id, type, fltrs) {
		try {
			var mySearch = search.load({
				id: id,
				type: type
			});

			if (!isEmpty(fltrs)) {
				for (each in fltrs) {
					log.debug({ title: 'UTIL : fltr', details: fltrs[each] });
					mySearch.filters.push(fltrs[each]);
				}
			}

			var results = mySearch.run().getRange(0, 1000);
			if (isEmpty(results)) return null;
			var completeResultSet = results; //copy the results
			var start = 1000;
			var last = 2000;
			//if there are more than 1000 records
			while (results.length == 1000) {
				results = mySearch.run().getRange(start, last);
				completeResultSet = completeResultSet.concat(results);
				start = parseFloat(start) + 1000;
				last = parseFloat(last) + 1000;
			}

			results = completeResultSet;
			//log.debug({title: 'results length',details: results.length,});

			return results;
		} catch (ex) {
			log.debug({ title: 'loadSearch Exception', details: ex });
		}
	}

	function isEmpty(val) {
		if (val == null || val == 'null' || val == undefined || val == '' || val == ' ' || val == 0 || val == 'undefined' || val === 'undefined' || val === undefined) {
			return true;
		}
		return false;
	}

	/***
	 * id : search id
	 * type : record type
	 */
	function getSearchColumns(id, type) {
		var mySearch = search.load({
			id: id,
			type: type
		});

		var cols = mySearch.columns;

		return cols;
	}

	/***
	 * rec : each record in search results
	 * cols : search columns
	 * col : search column index
	 */
	function getColumnValue(rec, cols, col) {
		if (isEmpty(col)) return null;
		var val = rec.getText(cols[col]);
		if (isEmpty(val))
			val = rec.getValue(cols[col]);
		return val;
	}

	function MONTHLYSEARCHCOLS() {
		var obj = {};
		obj.internalid = 0;
		obj.billSched = 1;
		obj.tranId = 2;
		obj.subsId = 3;
		obj.custName = 7;
		obj.custId = 8;
		obj.lineId = 9;
		obj.item = 10;
		obj.itemId = 11;
		obj.amt = 12;
		obj.qty = 13;
		obj.qtyBilled = 14;
		obj.type = 15;
		obj.acd = 16;

		return obj;
	}

	function CreateFAFltrs(obj) {
		try {
			var subs = obj.subs;
			var assetType = obj.assetType;
			var dateFrom = obj.dateFrom;
			var dateTo = obj.dateTo;
			var checkall = obj.checkall;

			var fltrs = {};
			var subsFltr = null;
			var aTypeFltr = null;
			var dateFltr = null;

			if (!checkall || checkall == 'false') {

				if (!isEmpty(subs)) {
					var subsFltr = search.createFilter({
						name: 'custrecord_deprhistsubsidiary',
						operator: search.Operator.ANYOF,
						values: subs
					});
				}

				if (!isEmpty(assetType)) {
					aTypeFltr = search.createFilter({
						name: 'custrecord_deprhistassettype',
						operator: search.Operator.ANYOF,
						values: assetType
					});
				}

				if (!isEmpty(dateFrom) && !isEmpty(dateTo)) {
					dateFltr = search.createFilter({
						name: 'custrecord_deprhistdate',
						operator: search.Operator.WITHIN,
						values: [dateFrom, dateTo]
					});
				} else if (!isEmpty(dateFrom) && isEmpty(dateTo)) {
					dateFltr = search.createFilter({
						name: 'custrecord_deprhistdate',
						operator: search.Operator.ONORAFTER,
						values: [dateFrom]
					});
				} else if (isEmpty(dateFrom) && !isEmpty(dateTo)) {
					dateFltr = search.createFilter({
						name: 'custrecord_deprhistdate',
						operator: search.Operator.ONORBEFORE,
						values: [dateTo]
					});
				}

				if (!isEmpty(subsFltr)) fltrs.subsFltr = subsFltr;
				if (!isEmpty(aTypeFltr)) fltrs.aTypeFltr = aTypeFltr;
				if (!isEmpty(dateFltr)) fltrs.dateFltr = dateFltr;
			}

			return fltrs;
		} catch (ex) {
			log.debug({ title: 'UTIL : CreateFAFltrs Ex', details: ex })
			return null;
		}
	}

	function isLeapYear(year) {
		return (year % 100 === 0) ? (year % 400 === 0) : (year % 4 === 0);
	}

	/***
	 * return the relevant script parameter ids
	 */
	function SCRIPTPARAMS() {
		var obj = {};
		obj.MONTHFIELD = 'custscript_flexible_inv_recurrence';
		obj.ISTESTING = 'custscript_flexible_inv_test_monthly';
		obj.QRTRLY_TESTING = 'custscript_flexible_inv_test_quarterly';
		obj.YEARLY_TESTING = 'custscript_flexible_inv_test_yearly';
		obj.MONTHLYCATCHUP_TESTING = 'custscript_flexible_inv_mon_catcup';
		return obj;
	}

	function STARTOFQUARTER() {
		var obj = [
			"JAN", "APR", "JUL", "OCT"
		];
		return obj;
	}

	function DAYSOFMONTH(isLeapYr) {

		var obj = {};
		obj[0] = 31;
		(isLeapYr) ? obj[1] = 29 : obj[1] = 28;
		obj[2] = 31;
		obj[3] = 30;
		obj[4] = 31;
		obj[5] = 30;
		obj[6] = 31;
		obj[7] = 31;
		obj[8] = 30;
		obj[9] = 31;
		obj[10] = 30;
		obj[11] = 31;
		return obj;
	}

	function DAYSDIFF(d1, d2) {
		try {
			// To calculate the time difference of two dates 
			var diffTime = d2.getTime() - d1.getTime();

			// To calculate the no. of days between two dates 
			return (diffTime / (1000 * 3600 * 24));
		} catch (ex) {
			log.debug({
				title: 'DAYSDIFF Ex',
				details: ex
			});
		}
	}

	function MONTHNAMES(id) {
		const obj = [
			"JAN", "FEB", "MAR", "APR", "MAY", "JUN",
			"JUL", "AUG", "SEPT", "OCT", "NOV", "DEC"
		];

		return obj[id];
	}

	function isWeekDay(day) {
		return (day != 0 && day != 6) ? true : false;
	}

	function getValidWorkingDay(date, recurrence) {
		try {
			var year = date.getFullYear();
			var month = date.getMonth();
			var daysOfMos = new DAYSOFMONTH(isLeapYear(year));
			var daysInMonth = daysOfMos[month];
			var resultDate = null;

			for (var i = 1; i <= daysInMonth; i++) {
				resultDate = new Date(year, month, i);
				if (0 === resultDate.getDay() || 6 === resultDate.getDay()) continue; //if weekends, continue to next loop

				//if (isHoliday(resultDate.getDate())) continue; 
				recurrence = recurrence - 1;

				if (recurrence > 0) continue; //determine which working day
				break;
			}

			return resultDate;
		} catch (ex) {
			log.debug({
				title: 'util : getValidWorkingDay ex',
				details: ex
			});
		}
	}

	function isHoliday(date) {

	}

	function getLocalDate(date) {
		try {
			var localDate = format.format({
				value: date,
				type: format.Type.DATETIME,
				timezone: format.Timezone.ASIA_KUALA_LUMPUR
			});

			return localDate;
		} catch (ex) {
			log.debug({
				title: 'getLocalDate Ex',
				details: ex
			});
		}
	}

	/***
	 * @param : script parameter field id
	 * Returns : boolean
	 */
	function validExecutionDay(param, type, dummyDate) {
		try {

			log.debug({
				title: 'Ignore Execution Date: ' + type,
				details: scriptObj.getParameter({ name: param })
			});

			if (scriptObj.getParameter({ name: param }))
				return true;

			if (isEmpty(dummyDate)) {
				var date = new Date();
				var currDate = getLocalDate(date);
			} else {
				var currDate = dummyDate;
			}

			currDate = format.parse({
				value: currDate,
				type: format.Type.DATE
			});

			//is weekday
			var currDay = currDate.getDay();

			if (type == 'QUARTERLY') {
				var startOfQtr = new STARTOFQUARTER();
				if (startOfQtr.indexOf(MONTHNAMES(currDate.getMonth())) == -1) {
					log.debug({
						title: 'month: ' + MONTHNAMES(currDate.getMonth()),
						details: 'not start of quarter.'
					});
					return false;
				}
			} else if (type == 'YEARLY') {
				var startOfYr = new STARTOFQUARTER();
				if (startOfYr.indexOf(MONTHNAMES(currDate.getMonth())) == -1) {
					log.debug({
						title: 'month: ' + MONTHNAMES(currDate.getMonth()),
						details: 'not start of year.'
					});
					return false;
				}
			}

			var wkDay = isWeekDay(currDay);
			if (!wkDay) return false;

			//get preference
			var workdayFldID = SCRIPTPARAMS().MONTHFIELD;
			if (isEmpty(workdayFldID)) return false;

			//get start of working day of the month
			var recurrence = scriptObj.getParameter({
				name: workdayFldID
			});

			var validWorkDate = getValidWorkingDay(currDate, recurrence);

			validWorkDate = format.format({
				value: validWorkDate,
				type: format.Type.DATE,
				timezone: format.Timezone.ASIA_KUALA_LUMPUR
			});

			currDate = format.format({
				value: currDate,
				type: format.Type.DATE,
				timezone: format.Timezone.ASIA_KUALA_LUMPUR
			});

			log.debug({
				title: 'validWorkDate: ' + validWorkDate,
				details: 'currDate: ' + currDate
			});

			if (type == 'MONTHLYCATCHUP') {
				if (validWorkDate == currDate) return false;
			} else {
				if (validWorkDate != currDate) return false;
			}

			return true;


		} catch (ex) {
			log.debug({
				title: 'ValidExecutionDay Ex',
				details: ex
			});
		}
	}

	/**
	 * @soId : interger ns SO id
	 * @itemId : integer ns item internal id
	 * @date : date - acd for prorated, currentdate for regular
	 * returns : float
	*/
	//    function rateRevisionLookup(soId,lineId,date){
	//     try{            
	//         var mySearch = search.create({
	//             type: "transaction",
	//             filters:
	//             [
	//                ["type","anyof",CUSTOM_SO_TRANS], 
	//                "AND", 
	//                ["mainline","is","F"], 
	//                "AND", 
	//                ["custbody_sales_order","anyof",soId], 
	//                "AND", 
	//                ["custcol_line_id","is",lineId], 
	//                "AND", 
	//                [
	//                    [
	//                        ["startdate","onorbefore",date],
	//                        "AND",
	//                        ["enddate","onorafter",date]
	//                     ],
	//                     "OR",
	//                     [
	//                         ["startdate","onorbefore",date],
	//                         "AND",
	//                         ["enddate","isempty",""]
	//                     ]
	//                 ]
	//             ],
	//             columns:
	//             [
	//                search.createColumn({name: "custbody_sales_order", label: "Sales Order"}),
	//                search.createColumn({name: "startdate", label: "Date From"}),
	//                search.createColumn({name: "enddate", label: "Date To"}),
	//                search.createColumn({name: "custcol_line_id", label: "Line ID"}),
	//                search.createColumn({name: "item", label: "Item"}),
	//                search.createColumn({name: "custcol_flex_inv_revised_amt", label: "Revised Rate"})
	//             ]
	//          });

	//         var results = mySearch.run().getRange(0, 1000);
	//         var completeResultSet = results; //copy the results
	//         var start = 1000;
	//         var last = 2000;
	//         //if there are more than 1000 records
	//         while(results.length == 1000){
	//             results = mySearch.run().getRange(start, last);
	//             completeResultSet = completeResultSet.concat(results);
	//             start = parseFloat(start)+1000;
	//             last = parseFloat(last)+1000;
	//         }

	//         results = completeResultSet;

	// 		if (results.length == 0){
	// 			log.debug({
	// 				title : 'rate revision results',
	// 				details : results.length
	// 			});
	// 			return null;
	// 		}

	// 		//group date with end date and without end date
	// 		var noEndDateArr = [];
	// 		var tempStartDate = null;
	// 		var withEndDateArr = [];
	// 		for (each in results){
	// 			var res = results[each];
	// 			var endDate = res.getValue('enddate');
	// 			var startdate = res.getValue('startdate');				
	// 			startdate = format.parse({
	// 				value: startdate,
	// 				type: format.Type.DATE
	// 			});

	// 			if (isEmpty(endDate)){
	// 				noEndDateArr.push(res);

	// 				if (startdate > tempStartDate){
	// 					tempStartDate = startdate;
	// 					noEndDateArr = [];
	// 					noEndDateArr.push(res);
	// 				}

	// 			}else if (!isEmpty(endDate)){
	// 				withEndDateArr.push(res);
	// 			}
	// 		}

	// 		log.debug({
	//             title : 'noEndDateArr',
	//             details : noEndDateArr
	// 		});

	// 		log.debug({
	//             title : 'withEndDateArr',
	//             details : withEndDateArr
	// 		});

	// 		var lineId = null;
	// 		var revisedAmt = null;

	// 		if (withEndDateArr.length>1) //overlap!
	// 			return null;

	// 		if (withEndDateArr.length==1){
	// 			lineId = withEndDateArr[0].getValue('custcol_line_id');
	// 			revisedAmt = withEndDateArr[0].getValue('custcol_flex_inv_revised_amt');
	// 		}else{
	// 			lineId = noEndDateArr[0].getValue('custcol_line_id');
	// 			revisedAmt = noEndDateArr[0].getValue('custcol_flex_inv_revised_amt');
	// 		}

	// 		if (isEmpty(revisedAmt)) return null
	//         revisedAmt = parseFloat(revisedAmt).toFixed(2);
	//         log.debug({
	//             title : 'results',
	//             details : 'line: '+lineId+', revised amount: '+revisedAmt
	//         });
	// 		return revisedAmt;

	//     }catch (ex){
	//         log.debug({
	//             title : 'rateRevisionLookup Ex',
	//             details : ex
	//         });
	//     }

	//     }
	function rateRevisionLookup(soId) {
		var ret = [];
		try {
			var mySearch = search.create({
				type: "transaction",
				filters:
					[
						["type", "anyof", CUSTOM_SO_TRANS],
						"AND",
						["mainline", "is", "F"],
						"AND",
						["custbody_sales_order", "anyof", soId],

					],
				columns:
					[
						search.createColumn({ name: "custbody_sales_order", label: "Sales Order" }),
						search.createColumn({ name: "startdate", label: "Date From" }),
						search.createColumn({ name: "enddate", label: "Date To" }),
						search.createColumn({ name: "custcol_line_id", label: "Line ID" }),
						search.createColumn({ name: "item", label: "Item" }),
						search.createColumn({ name: "custcol_flex_inv_revised_amt", label: "Revised Rate" })
					]
			});

			var results = mySearch.run().getRange(0, 1000);
			var completeResultSet = results; //copy the results
			var start = 1000;
			var last = 2000;
			//if there are more than 1000 records
			while (results.length == 1000) {
				results = mySearch.run().getRange(start, last);
				completeResultSet = completeResultSet.concat(results);
				start = parseFloat(start) + 1000;
				last = parseFloat(last) + 1000;
			}

			results = completeResultSet;

			if (results.length == 0) {
				log.debug({
					title: 'rate revision results',
					details: results.length
				});
				return ret;
			}

			for (each in results) {
				var res = results[each];
				var startdate = res.getValue('startdate');
				var endDate = res.getValue('enddate');
				var lineId = res.getValue('custcol_line_id');
				var revisedAmt = parseFloat(res.getValue('custcol_flex_inv_revised_amt')).toFixed(2) || 0;
				ret.push({
					startDate: startdate,
					endDate: endDate,
					lineId: lineId,
					revisedAmt: revisedAmt
				})

			}
			log.debug("rateRevisionLookup ret ", ret)
			return ret;

		} catch (ex) {
			log.debug({
				title: 'rateRevisionLookup Ex',
				details: ex
			});
		}

	}
	return {
		isEmpty: isEmpty,
		loadSearch: loadSearch,
		getSearchColumns: getSearchColumns,
		getColumnValue: getColumnValue,
		isLeapYear: isLeapYear,
		isWeekDay: isWeekDay,
		getValidWorkingDay: getValidWorkingDay,
		getLocalDate: getLocalDate,
		rateRevisionLookup: rateRevisionLookup,
		validExecutionDay: validExecutionDay,
		DAYSDIFF: DAYSDIFF,
		MONTHLYSEARCHCOLS: MONTHLYSEARCHCOLS,
		SEARCHID: SEARCHID,
		SCRIPTPARAMS: SCRIPTPARAMS,
		DAYSOFMONTH: DAYSOFMONTH,
		MONTHNAMES: MONTHNAMES,
		STARTOFQUARTER: STARTOFQUARTER
	};
}