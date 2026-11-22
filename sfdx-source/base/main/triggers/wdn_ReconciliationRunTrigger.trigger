trigger wdn_ReconciliationRunTrigger on wdn_Reconciliation_Run__c(
  before delete
) {
  wdn_OperationalRecordGuard.blockUnlessMaintainer(Trigger.old);
}
