/**
 * Immutable ledger history, with a one-time revocation audit transition.
 */
public with sharing class wdn_OperationalRecordGuard {
  @TestVisible
  private static final String MAINTENANCE_PERMISSION = 'wdn_Ledger_Maintenance';
  @TestVisible
  private static final Set<String> REVOCATION_FIELDS =
    new Set<String>{ 'wdn_revoked_on__c', 'wdn_revoked_by_run__c' };
  private static Set<String> protectedGrantFields;
  /**
   * Error added to records when the operation requires maintenance access.
   */
  public static final String MESSAGE =
    'Warden operational records can only be changed with the Ledger Maintenance permission.';

  /**
   * Rejects changes to operational records by callers without maintenance access.
   * @param records Records that require maintenance access
   */
  public static void blockUnlessMaintainer(List<SObject> records) {
    if (FeatureManagement.checkPermission(MAINTENANCE_PERMISSION)) {
      return;
    }
    for (SObject record : records) {
      record.addError(MESSAGE);
    }
  }

  /**
   * Restricts grant changes to maintainers and one-time revocation updates.
   * @param rows Incoming grants, or the old records on delete
   * @param oldRows Grants before the operation
   * @param operation Before-update or before-delete trigger operation
   */
  public static void ledger(
    List<wdn_Provisioned_Grant__c> rows,
    Map<Id, wdn_Provisioned_Grant__c> oldRows,
    System.TriggerOperation operation
  ) {
    // This handler only enforces changes to existing grants.
    if (
      operation != System.TriggerOperation.BEFORE_UPDATE
      && operation != System.TriggerOperation.BEFORE_DELETE
    ) {
      return;
    }
    if (FeatureManagement.checkPermission(MAINTENANCE_PERMISSION)) {
      return;
    }
    for (wdn_Provisioned_Grant__c row : rows) {
      if (
        operation == System.TriggerOperation.BEFORE_DELETE
        || !revocationOnly(row, oldRows?.get(row.Id))
      ) {
        row.addError(MESSAGE);
      }
    }
  }
  @TestVisible
  private static Boolean revocationOnly(
    wdn_Provisioned_Grant__c row,
    wdn_Provisioned_Grant__c oldRow
  ) {
    if (oldRow == null || !setsRevocationForFirstTime(row, oldRow)) {
      return false;
    }
    for (String name : getProtectedGrantFields()) {
      if (row.get(name) != oldRow.get(name)) {
        return false;
      }
    }
    return true;
  }

  private static Boolean setsRevocationForFirstTime(
    wdn_Provisioned_Grant__c row,
    wdn_Provisioned_Grant__c oldRow
  ) {
    return oldRow.wdn_Revoked_On__c == null
      && oldRow.wdn_Revoked_By_Run__c == null
      && row.wdn_Revoked_On__c != null
      && row.wdn_Revoked_By_Run__c != null;
  }

  @TestVisible
  private static Set<String> getProtectedGrantFields() {
    if (protectedGrantFields == null) {
      protectedGrantFields = new Set<String>();
      // Describe updateability reflects the caller's FLS. System-mode writes
      // can change fields outside that FLS, so compare all stored fields.
      for (Schema.SObjectField field : wdn_Provisioned_Grant__c.SObjectType.getDescribe(
          SObjectDescribeOptions.DEFERRED
        )
        .fields
        .getMap()
        .values()) {
        Schema.DescribeFieldResult details = field.getDescribe();
        String name = details.getName().toLowerCase();
        if (
          !REVOCATION_FIELDS.contains(name)
          && !details.isCalculated()
          && !details.isAutoNumber()
        ) {
          protectedGrantFields.add(name);
        }
      }
    }
    return protectedGrantFields;
  }
}
