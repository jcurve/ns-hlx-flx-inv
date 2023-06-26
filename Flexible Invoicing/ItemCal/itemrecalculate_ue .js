/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */

/**
 * @name:                                       itemrecalculate_ue.js
 * @author:                                     Junnel C. Mercado
 * @summary:                                    . This script runs similar calculations process from 
 *                                              . the client script SO_CS_v1.6.
 * @copyright:                                  © Copyright by Jcurve Solutions
 * Date Created:                                Tue Jun 28 2022 6:59:06 AM
 * Change Logs:
 * Date                          Author               Description
 * Tue Jun 28 2022 6:59:06 AM -- Junnel C. Mercado -- Initial Creation
 * Thu Jul 06 2022 7:12:04 AM -- Junnel C. Mercado -- Created a reprocess of line items similar to the client script.
 */


define(['N/record', 'N/search', 'N/runtime', 'N/format'],
    (record, search, runtime, format) => {
        /**
         * Defines the function definition that is executed before record is submitted.
         * @param {Object} scriptContext
         * @param {Record} scriptContext.newRecord - New record
         * @param {Record} scriptContext.oldRecord - Old record
         * @param {string} scriptContext.type - Trigger type; use values from the context.UserEventType enum
         * @since 2015.2
         */
        const beforeSubmit = (scriptContext) => {
            // TODO - get the old record and get origin rates (custcol_orig_rate) on sublist
            // TODO - set line variance on each lines, (Note: Empty origrate is 0.0001)
            // TODO - Calculate first the line varience on loop and then calculate the total line variance for header line variance
            // TODO - ordervariance 
            try {
                log.emergency({
                    title: 'scriptContext type',
                    details: scriptContext.type
                })

                let currentExecutionContext = runtime.executionContext;
                log.emergency({
                    title: 'currentExecutionContext',
                    details: currentExecutionContext
                })
                let newRecord = scriptContext.newRecord;
                let oldRecord = scriptContext.oldRecord;
                if (newRecord.type == record.Type.SALES_ORDER || newRecord.type == record.Type.ESTIMATE) {

                    log.emergency({
                        title: 'currentExecutionContext',
                        details: currentExecutionContext
                    })
                    /**
                     * This part of the script source amount values due to possible scenario of CSV upload not having values on the orig columns
                     */
                    if (currentExecutionContext == 'CSVIMPORT' || currentExecutionContext == 'WEBSERVICES' || newRecord.getValue({ fieldId: 'createdfrom' })) {
                        setAmountValue(newRecord, oldRecord, scriptContext.type);
                    }

                    if (currentExecutionContext == 'USERINTERFACE' || currentExecutionContext == 'CSVIMPORT' || currentExecutionContext == 'WEBSERVICES' || newRecord.getValue({ fieldId: 'createdfrom' })) {
                        reCalculateLineVarianceValue(newRecord, oldRecord, scriptContext.type);
                        calculateVarianceColumns(newRecord, oldRecord);
                    }
                }
            } catch (error) {
                log.error({
                    title: 'error on process',
                    details: error
                })
            }
        }

        const setAmountValue = (newTransactionRecord, oldTransactionRecord, contextType) => {
            let itemLineCount = newTransactionRecord.getLineCount({ sublistId: 'item' });
            log.emergency({
                title: 'itemLineCount CSV/Webservices/Transform',
                details: itemLineCount
            })
            for (let index = 0; index < itemLineCount; index++) {

                const item = newTransactionRecord.getSublistValue({ sublistId: 'item', fieldId: 'item', line: index });
                //const rate = newTransactionRecord.getSublistValue({ sublistId: 'item', fieldId: 'rate', line: index })|| 0.0001;
                var rate = newTransactionRecord.getSublistValue({ sublistId: 'item', fieldId: 'rate', line: index })
                if(!rate){
                    rate=0;
                }
                var origrate = newTransactionRecord.getSublistValue({ sublistId: 'item', fieldId: 'custcol_orig_rate', line: index })
                if(!origrate){
                    origrate=rate
                }
                const amount = newTransactionRecord.getSublistValue({ sublistId: 'item', fieldId: 'amount', line: index }) || 0;
                const priceLevel = newTransactionRecord.getSublistValue({ sublistId: 'item', fieldId: 'price', line: index }) || '';

                const origPriceLevel = newTransactionRecord.getSublistValue({ sublistId: 'item', fieldId: 'custcol_orig_price_level', line: index }) || '';

                if (contextType == 'create') {
                    log.emergency({
                        title: 'Loop Variable CSV Import',
                        details: {
                            rate: rate,
                            amount: amount,
                            priceLevel: priceLevel
                        }
                    });
                    if (priceLevel == -1) {
                        newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'custcol_orig_price_level', value: '', line: index });
                    } else {
                        newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'custcol_orig_price_level', value: priceLevel, line: index });
                    }
                    //newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'custcol_orig_rate', value: rate, line: index });
                    newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'custcol_orig_rate', value: origrate, line: index });

                    newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'custcol_orig_ext_amt', value: amount, line: index });
                } else if (contextType == 'edit') {

                    if (/*(priceLevel !== origPriceLevel) ||*/ (priceLevel != -1 && priceLevel !== origPriceLevel) || (priceLevel == -1 && origPriceLevel != '')) {
                        if (priceLevel == -1) {
                            newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'custcol_temp_price_level', value: '', line: index });
                        } else {
                            newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'custcol_temp_price_level', value: priceLevel, line: index });
                        }
                        //newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'custcol_temp_price_level', line: index, value: priceLevel });
                        // newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'price', line: index, value: priceLevel });
                        // newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'amount', line: index, value: amount });
                    } else {
                        // newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'price', line: index, value: (origPriceLevel == '' ? -1 : origPriceLevel) });
                        // newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'amount', line: index, value: amount });
                    }
                }
            }
        }
        const reCalculateLineVarianceValue = (newTransactionRecord, oldTransactionRecord, contextType) => {
            let itemLineCount = newTransactionRecord.getLineCount({ sublistId: 'item' })

            for (let index = 0; index < itemLineCount; index++) {
                let origrateLine = 0;
                const lineUniqueKey = newTransactionRecord.getSublistValue({ sublistId: 'item', fieldId: 'lineuniquekey', line: index }) || '';
                log.emergency({
                    title: `${index} - lineUniqueKey`,
                    details: lineUniqueKey
                });
                // Re do calculations for line variance
                const item = newTransactionRecord.getSublistValue({ sublistId: 'item', fieldId: 'item', line: index }) || '';
                const qty = newTransactionRecord.getSublistValue({ sublistId: 'item', fieldId: 'quantity', line: index }) || 0;
                const rate = newTransactionRecord.getSublistValue({ sublistId: 'item', fieldId: 'rate', line: index }) || 0;
                const amount = newTransactionRecord.getSublistValue({ sublistId: 'item', fieldId: 'amount', line: index }) || 0;
                const priceLevel = newTransactionRecord.getSublistValue({ sublistId: 'item', fieldId: 'price', line: index }) || '';
                // Commented out @ Nov 11 2022 due to added client script
                // if (contextType == 'create' || lineUniqueKey == '') {
                //     newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'custcol_orig_rate', line: index, value: rate });
                //     newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'custcol_orig_ext_amt', line: index, value: amount })
                //     newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'custcol_orig_price_level', line: index, value: (priceLevel == -1 ? '' : priceLevel) })
                //     newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'custcol_temp_price_level', line: index, value: (priceLevel == -1 ? '' : priceLevel) })
                // }
                const origrate = newTransactionRecord.getSublistValue({ sublistId: 'item', fieldId: 'custcol_orig_rate', line: index }) || 0.0001;
                const origPriceLevel = newTransactionRecord.getSublistValue({ sublistId: 'item', fieldId: 'custcol_orig_price_level', line: index }) || '';
                const excludeFromVarCalc = newTransactionRecord.getSublistValue({ sublistId: 'item', fieldId: 'custcol_exclude_from_variance_calc', line: index }) || '';
                const tempPriceLevel = newTransactionRecord.getSublistValue({ sublistId: 'item', fieldId: 'custcol_temp_price_level', line: index }) || '';

                log.emergency({
                    title: `Loop Variable ${index}`,
                    details: {
                        line_index: index,
                        excludeFromVarCalc: excludeFromVarCalc,
                        item: item,
                        qty: qty,
                        rate: rate,
                        amount: amount,
                        priceLevel: priceLevel,
                        origrate: origrate,
                        origPriceLevel: origPriceLevel
                    }
                });

                let itemType = newTransactionRecord.getSublistValue({ sublistId: 'item', fieldId: 'custcol_item_type', line: index }) || '';
                if (itemType == 'Discount') {
                    let livarience = newTransactionRecord.getSublistValue({ sublistId: 'item', fieldId: 'amount', line: index }) || '';
                    newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'custcol_orig_rate', line: index, value: 0.00 });
                    newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'custcol_orig_ext_amt', line: index, value: 0.00 });
                    newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'custcol_orig_price_level', line: index, value: '' });
                    newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'custcol_line_variance', line: index, value: livarience });
                } else {
                    if ((priceLevel != -1 && origPriceLevel == priceLevel) || (priceLevel == -1 && origPriceLevel != '')) {
                        log.emergency({
                            title: 'Pass 1',
                            details: 'Pass 1'
                        });
                        origrateLine = newTransactionRecord.getSublistValue({ sublistId: 'item', fieldId: 'rate', line: index }) || 0;
                        log.emergency({
                            title: 'Pass 2',
                            details: 'Pass 2'
                        });
                        if (/*!tempPriceLevel*/ contextType == 'create') {
                            // newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'price', line: index, value: priceLevel });
                            log.emergency({
                                title: 'Pass 3',
                                details: 'Pass 3'
                            });
                        } else {

                            if (priceLevel == -1 && origPriceLevel !== '') {
                                // Commented out @ Nov 11 2022 due to added client script
                                // newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'custcol_temp_price_level', line: index, value: (priceLevel == -1 ? '' : priceLevel) });
                            }

                            // This code block sets the temp price level and price level to the orignal value if the user selects the original price level to the line item
                            if ((priceLevel == origPriceLevel) || (priceLevel == -1 && origPriceLevel == '')) {
                                // Commented out @ Nov 11 2022 due to added client script
                                // newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'custcol_temp_price_level', line: index, value: (priceLevel == -1 ? '' : priceLevel) });
                                // newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'price', line: index, value: (origPriceLevel == '' ? -1 : origPriceLevel) });
                            }

                            log.emergency({
                                title: 'Pass 4',
                                details: 'Pass 4'
                            });
                        }

                        // Commented out because this might be the cause for setting the rate based on rate value
                        let currentRateAmountValue = newTransactionRecord.getSublistValue({ sublistId: 'item', fieldId: 'custcol_orig_rate', line: index })
                        if (!currentRateAmountValue) {
                            // Commented out @ Nov 11 2022 due to added client script
                            // newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'custcol_orig_rate', line: index, value: origrateLine });
                        }

                        log.emergency({
                            title: 'orig rate current value',
                            details: newTransactionRecord.getSublistValue({ sublistId: 'item', fieldId: 'custcol_orig_rate', line: index })
                        })

                        log.emergency({
                            title: 'Pass 5',
                            details: 'Pass 5'
                        });
                        log.emergency({
                            title: `Loop If Price Level Values ${index}`,
                            details: {
                                item: item,
                                qty: qty,
                                rate: rate,
                                amount: amount,
                                priceLevel: priceLevel,
                                tempPriceLevel: tempPriceLevel,
                                origPriceLevel: origPriceLevel
                            }
                        })

                    } else {
                        log.emergency({
                            title: `Loop Else Price Level Values ${index}`,
                            details: {
                                item: item,
                                qty: qty,
                                rate: rate,
                                amount: amount,
                                priceLevel: priceLevel,
                                tempPriceLevel: tempPriceLevel,
                                origPriceLevel: origPriceLevel
                            }
                        })

                        log.emergency({
                            title: 'Pass 6',
                            details: 'Pass 6'
                        });

                        if (/*!tempPriceLevel*/ contextType == 'create') {
                            // Commented out @ Nov 11 2022 due to added client script
                            // newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'price', line: index, value: priceLevel });
                            log.emergency({
                                title: 'Pass 7',
                                details: 'Pass 7'
                            });
                        } else {
                            // Scenario if the line price level is changed/not the same with orig price level, the price level value will source to the temp price level 
                            if ((priceLevel !== origPriceLevel) || (priceLevel !== -1 && origPriceLevel !== '')) {
                                log.emergency({
                                    title: 'Pass 8.1',
                                    details: {
                                        priceLevel: priceLevel,
                                        tempPriceLevel: tempPriceLevel,
                                        origPriceLevel: origPriceLevel
                                    }
                                })
                                // Commented out @ Nov 11 2022 due to added client script
                                // newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'custcol_temp_price_level', line: index, value: (priceLevel == -1 ? '' : priceLevel) });
                                // newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'price', line: index, value: (priceLevel == -1 ? -1 : priceLevel) });
                            } else if (priceLevel == origPriceLevel) {
                                log.emergency({
                                    title: 'Pass 8.2',
                                    details: {
                                        priceLevel: priceLevel,
                                        tempPriceLevel: tempPriceLevel,
                                        origPriceLevel: origPriceLevel
                                    }
                                })
                                // Commented out @ Nov 11 2022 due to added client script
                                // newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'custcol_temp_price_level', line: index, value: origPriceLevel });
                                // newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'price', line: index, value: (origPriceLevel == '' ? -1 : origPriceLevel) });
                            }

                            log.emergency({
                                title: 'Pass 8',
                                details: 'Pass 8'
                            });
                        }
                        // Commented out @ Nov 11 2022 due to added client script
                        // newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'rate', line: index, value: rate });
                        // newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'amount', line: index, value: amount });

                        log.emergency({
                            title: 'Pass 9',
                            details: 'Pass 9'
                        });

                        origrateLine = newTransactionRecord.getSublistValue({ sublistId: 'item', fieldId: 'rate', line: index }) || 0;
                        // Confirmation with teron, what will happen if we edit the sales order multiple times will the orig rate, amount and price level columns will change based on the previous SO values?
                        // September 28, 2022 - this was commented out because of client requirement once they change the price level, the orig rate should stay the same.
                        // newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'custcol_orig_rate', line: index, value: origrateLine });
                        // newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'custcol_temp_price_level', line: index, value: (tempPriceLevel == -1 ? '' : tempPriceLevel) });
                    }
                    log.emergency({
                        title: 'Pass 10',
                        details: 'Pass 10'
                    });
                    log.emergency({
                        title: `Pass 10.1 ${index}`,
                        details: {
                            item: item,
                            qty: qty,
                            rate: rate,
                            amount: amount,
                            origrate: newTransactionRecord.getSublistValue({ sublistId: 'item', fieldId: 'custcol_orig_rate', line: index }),
                            origamount: newTransactionRecord.getSublistValue({ sublistId: 'item', fieldId: 'custcol_orig_ext_amt', line: index }),
                            priceLevel: priceLevel,
                            tempPriceLevel: tempPriceLevel,
                            origPriceLevel: origPriceLevel
                        }
                    });

                    // This was set here because there is a chance that the user might change amount. This is to compute linevariance column
                    // Commented out @ Nov 11 2022 due to added client script
                    // newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'amount', line: index, value: amount });

                    log.emergency({
                        title: 'orig rate and quantity',
                        details: {
                            origrate,
                            qty,
                            computation: origrate * qty
                        }
                    })
                    let formatOrigRate = format.format({
                        value: origrate,
                        type: format.Type.CURRENCY
                    });

                    let origamt = origrate * qty;
                    log.emergency({
                        title: `origamt ${index}`,
                        details: origamt
                    })
                    // let origamt = newTransactionRecord.getSublistValue({
                    //     sublistId: 'item',
                    //     fieldId: 'custcol_orig_ext_amt',
                    //     line: index
                    // });
                    // let origamt = origrateLine * qty;
                    let lineamount = newTransactionRecord.getSublistValue({ sublistId: 'item', fieldId: 'amount', line: index }) || 0.00;
                    let livarience = lineamount - origamt.toFixed(2);
                    log.emergency({
                        title: 'line variance computation',
                        details: {
                            origamt,
                            lineamount,
                            livarience,
                            formatOrigRate
                        }
                    });
                    // September 28, 2022 - this was commented out because of client requirement once they change the price level, the orig amount should stay the same.
                    // September 28, 2022 - apparently this is needed if the user suddenly change the quantity and it needs to be change.

                    let currentOrigAmountValue = newTransactionRecord.getSublistValue({ sublistId: 'item', fieldId: 'custcol_orig_ext_amt', line: index })

                    // Commented out @ Nov 11 2022 due to added client script
                    if (!currentOrigAmountValue || currentOrigAmountValue !== origamt) {
                        // Commented out @ Nov 11 2022 due to added client script
                        // newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'custcol_orig_ext_amt', line: index, value: origamt });
                    }
                    log.emergency({
                        title: 'orig amt current value',
                        details: newTransactionRecord.getSublistValue({ sublistId: 'item', fieldId: 'custcol_orig_ext_amt', line: index })
                    });

                    log.emergency({
                        title: `${index} - origamt`,
                        details: origamt
                    });
                    log.emergency({
                        title: `excludeFromVarCalc ${index}`,
                        details: excludeFromVarCalc
                    })
                    if(!excludeFromVarCalc){
                        newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'custcol_line_variance', line: index, value: livarience });  
                    } else {
                        newTransactionRecord.setSublistValue({ sublistId: 'item', fieldId: 'custcol_line_variance', line: index, value: 0 });  
                    }
                }
            }
        }

        const calculateVarianceColumns = (newTransactionRecord, oldTransactionRecord) => {

            const recordType = newTransactionRecord.type;
            log.emergency({ title: 'recordType', details: recordType })
            const itemLineCount = newTransactionRecord.getLineCount({ sublistId: 'item' })

            if (recordType == 'salesorder' || recordType == 'estimate') {
                let ord_actual = 0;
                let ord_orign = 0;
                let linevarianvetotal = 0;
                let discountrate = newTransactionRecord.getValue({ fieldId: 'discountrate' });

                log.emergency({
                    title: 'process line variance total function variables 1',
                    details: {
                        ord_actual: ord_actual,
                        ord_orign: ord_orign,
                        linevarianvetotal: linevarianvetotal,
                        discountrate: discountrate
                    }
                })

                for (let index = 0; index < itemLineCount; index++) {
                    let item = newTransactionRecord.getSublistValue({ sublistId: 'item', fieldId: 'item', line: index });
                    log.emergency({
                        title: 'item',
                        details: `${item} - ${index}`
                    })
                    if (item) {
                        if (item !== '-2') {
                            let excludeFromVarCalc = newTransactionRecord.getSublistValue({ sublistId: 'item', fieldId: 'custcol_exclude_from_variance_calc', line: index });
                            log.emergency({
                                title: 'excludeFromVarCalc',
                                details: `${excludeFromVarCalc} - ${index}`
                            })
                            let linefxamount = newTransactionRecord.getSublistValue({ sublistId: 'item', fieldId: 'amount', line: index }) || 0;
                            let lineqty = newTransactionRecord.getSublistValue({ sublistId: 'item', fieldId: 'quantity', line: index }) || 0;
                            let lineorigrate = newTransactionRecord.getSublistValue({ sublistId: 'item', fieldId: 'custcol_orig_rate', line: index }) || 0;
                            let linevarianve = newTransactionRecord.getSublistValue({ sublistId: 'item', fieldId: 'custcol_line_variance', line: index }) || 0;

                            log.emergency({
                                title: `variable status ${index}`,
                                details: {
                                    linefxamount: linefxamount,
                                    lineqty: lineqty,
                                    lineorigrate: lineorigrate,
                                    linevarianve: linevarianve
                                }
                            })

                            ord_actual = parseFloatOrZero(ord_actual) + parseFloatOrZero(linefxamount);
                            if (!excludeFromVarCalc) {
                                ord_orign = parseFloatOrZero(ord_orign) + (parseFloatOrZero(lineqty) * parseFloatOrZero(lineorigrate));
                                linevarianvetotal = parseFloatOrZero(linevarianvetotal) + parseFloatOrZero(linevarianve);
                            } else {
                                ord_orign = parseFloatOrZero(ord_orign) + parseFloatOrZero(linefxamount);
                            }

                            log.emergency({
                                title: `linevarianvetotal and ord_orign status ${index}`,
                                details: {
                                    linevarianvetotal: linevarianvetotal,
                                    ord_actual: ord_actual,
                                    ord_orign: ord_orign,
                                    index: index
                                }
                            })
                        }
                    }
                }

                if (discountrate) {
                    log.emergency({
                        title: 'dcrate 1',
                        details: discountrate
                    })
                    let discrate = 0;
                    if (discountrate) {
                        log.emergency({
                            title: 'dcrate 1',
                            details: discountrate
                        })
                        discrate = ord_actual * (parseFloatOrZero(discountrate) / 100)
                        log.emergency({
                            title: 'discrate 1',
                            details: discrate
                        })
                    } else {
                        discrate = discountrate || 0;
                    }
                    ord_actual = parseFloatOrZero(ord_actual) + parseFloatOrZero(discrate);
                    linevarianvetotal = parseFloatOrZero(linevarianvetotal) + parseFloatOrZero(discrate);
                }

                let ordervariance = 0;
                if (ord_orign != null && ord_orign != '' && parseFloatOrZero(ord_orign) > 0) {
                    ordervariance = ((parseFloatOrZero(ord_actual) / parseFloatOrZero(ord_orign)) - 1) * 100;
                } else {
                    ordervariance = 0;
                }
                if (ordervariance != null && !isNaN(ordervariance)) {

                    log.emergency({
                        title: 'ordervariance 1',
                        details: ordervariance
                    });
                    newTransactionRecord.setValue({
                        fieldId: 'custbody_order_variance_pc',
                        value: Math.abs(ordervariance.toFixed(2)),
                    });
                }
                if (linevarianvetotal != null && !isNaN(linevarianvetotal)) {
                    log.emergency({
                        title: 'linevarianvetotal ',
                        details: linevarianvetotal
                    });
                    newTransactionRecord.setValue({
                        fieldId: 'custbody_order_variance',
                        value: linevarianvetotal,
                    });
                }
            }
        }

        const parseFloatOrZero = (a) => {
            a = parseFloat(a);
            return isNaN(a) ? 0 : a
        }

        return { beforeSubmit }

    });