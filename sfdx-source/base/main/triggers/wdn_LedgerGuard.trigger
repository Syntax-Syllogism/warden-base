trigger wdn_LedgerGuard on wdn_Provisioned_Grant__c(
  before update,
  before delete
) {
  wdn_OperationalRecordGuard.ledger(
    Trigger.isDelete ? Trigger.old : Trigger.new,
    Trigger.oldMap,
    Trigger.operationType
  );
}
