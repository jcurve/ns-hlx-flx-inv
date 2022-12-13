/**
*@NApiVersion 2.x
*@NScriptType UserEventScript
*@NModuleScope Public
*/

define([
'N/record',
'N/log'
],
function (
record,
log
)
{
	var SOQTY = 999;
	function BeforeSubmit(context){
	try{
		var type = context.type;
		var rec = context.newRecord;
		//if (type != 'create') return;
		
		
		SetQtyAndAmount(rec);
		
	}catch(ex){
		log.debug({title:'BeforeSubmit Exception',details: ex});
	}
	}
	
	function SetQtyAndAmount(rec){
	try{
		log.debug({title:'SetQtyAndAmount',details: 'Enter'});
		var lineCnt = rec.getLineCount({
			sublistId : 'item'
		});
		var billing_schedule = rec.getValue("custbody_billing_schedule");
		
		for (var i=0; i<lineCnt; i++){
			
			
			var isLicensed = rec.getSublistValue({
				sublistId : 'item',
				fieldId : 'custcol_is_licensed_item',
				line : i
			});
			
			log.debug({title:'isLicensed',details: isLicensed});
			log.debug({title:'billing_schedule',details: billing_schedule});

			if (isLicensed && billing_schedule)
			{
				var rate = rec.getSublistValue({
					sublistId : 'item',
					fieldId : 'rate',
					line : i
				});
				
				rec.setSublistValue({
					sublistId : 'item',
					fieldId : 'quantity',
					line : i,
					value : SOQTY
				});			
				
				rec.setSublistValue({
					sublistId : 'item',
					fieldId : 'amount',
					line : i,
					value : rate
				});
			}
			
		}
		
	}catch(ex){
		log.debug({title:'SetQtyAndAmount Exception',details: ex});
	}
	}
	
	function BeforeLoad(context){
	try{
		//log.debug({title:'BeforeLoad context',details: context});
	}catch(ex){
		log.debug({title:'BeforeLoad Exception',details: ex});
	}
	}
	
	return {
		beforeSubmit : BeforeSubmit,
		beforeLoad : BeforeLoad
	}	
}
);