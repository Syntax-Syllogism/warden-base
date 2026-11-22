/**
 * Immutable ledger history, with a one-time revocation audit transition.
 */
public with sharing class wdn_OperationalRecordGuard {
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
    if (FeatureManagement.checkPermission('wdn_Ledger_Maintenance')) {
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
    if (FeatureManagement.checkPermission('wdn_Ledger_Maintenance')) {
      return;
    }
    for (wdn_Provisioned_Grant__c row : rows) {
      if (
        operation == System.TriggerOperation.BEFORE_DELETE
        || !revocationOnly(row, oldRows.get(row.Id))
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
    if (!setsRevocationForFirstTime(row, oldRow)) {
      return false;
    }
    Map<String, Schema.SObjectField> fields =
      Schema.SObjectType.wdn_Provisioned_Grant__c.fields.getMap();
    for (String name : fields.keySet()) {
      if (
        isProtectedField(name, fields.get(name))
        && row.get(name) != oldRow.get(name)
      ) {
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

  private static Boolean isProtectedField(
    String name,
    Schema.SObjectField field
  ) {
    if (
      name.equalsIgnoreCase('wdn_Revoked_On__c')
      || name.equalsIgnoreCase('wdn_Revoked_By_Run__c')
    ) {
      return false;
    }
    return name.equalsIgnoreCase('OwnerId')
      || name.equalsIgnoreCase('Name')
      || (
        name.endsWithIgnoreCase('__c') && !field.getDescribe().isCalculated()
      );
  }
}
