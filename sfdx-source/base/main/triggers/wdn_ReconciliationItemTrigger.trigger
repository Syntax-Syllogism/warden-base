trigger wdn_ReconciliationItemTrigger on wdn_Reconciliation_Item__c(
  before delete
) {
  wdn_OperationalRecordGuard.blockUnlessMaintainer(Trigger.old);
}
