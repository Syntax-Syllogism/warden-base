@IsTest
private class wdn_OperationalRecordGuardTest {
  @TestSetup
  static void users() {
    User integration = wdn_TriggerTestUsers.minimalAccessUser('guardint');
    User maintenance = wdn_TriggerTestUsers.minimalAccessUser('guardmnt');
    List<User> users = new List<User>{ integration, maintenance };
    insert users;
    insert new List<PermissionSetAssignment>{
      new PermissionSetAssignment(
        AssigneeId = integration.Id,
        PermissionSetId =
          [SELECT Id FROM PermissionSet WHERE Name = 'wdn_Integration'].Id
      ),
      new PermissionSetAssignment(
        AssigneeId = maintenance.Id,
        PermissionSetId =
          [SELECT Id FROM PermissionSet WHERE Name = 'wdn_Ledger_Maintenance']
            .Id
      )
    };
  }
  private static User operator(String alias) {
    return [SELECT Id FROM User WHERE Alias = :alias];
  }
  private static wdn_Reconciliation_Run__c run() {
    wdn_Reconciliation_Run__c row =
      new wdn_Reconciliation_Run__c(wdn_Mode__c = 'Preview');
    insert row;
    return row;
  }
  private static void denied(Database.Error error) {
    System.assertEquals(wdn_OperationalRecordGuard.MESSAGE, error.getMessage());
  }
  @IsTest
  static void integrationCannotChangeLedgerOrDeleteRunsAndItems() {
    System.runAs(operator('guardint')) {
      System.assert(
        !FeatureManagement.checkPermission('wdn_Ledger_Maintenance'),
        'The integration user must lack Ledger Maintenance'
      );
      wdn_Reconciliation_Run__c parent = run();
      List<wdn_Provisioned_Grant__c> grants =
        new List<wdn_Provisioned_Grant__c>();
      for (Integer i = 0; i < 200; i++) {
        grants.add(new wdn_Provisioned_Grant__c(wdn_Target_Id__c = 'original'));
      }
      insert grants;
      for (wdn_Provisioned_Grant__c row : grants) {
        row.wdn_Target_Label__c = 'changed';
      }
      for (Database.SaveResult result : Database.update(grants, false)) {
        System.assert(!result.isSuccess());
        denied(result.getErrors()[0]);
      }
      for (Database.DeleteResult result : Database.delete(grants, false)) {
        System.assert(!result.isSuccess());
        denied(result.getErrors()[0]);
      }
      wdn_Reconciliation_Item__c item =
        new wdn_Reconciliation_Item__c(
          wdn_Reconciliation_Run__c = parent.Id,
          wdn_User_Key__c = 'test'
        );
      insert item;
      denied(Database.delete(item, false).getErrors()[0]);
      denied(Database.delete(parent, false).getErrors()[0]);
      System.assertEquals(
        1,
        [SELECT COUNT() FROM wdn_Reconciliation_Item__c WHERE Id = :item.Id]
      );
      parent.wdn_Applied_Count__c = 1;
      update parent;
      item.wdn_Status__c = 'Applied';
      update item;
    }
  }
  @IsTest
  static void pairedRevocationIsForwardOnlyAndCannotHideOtherEdits() {
    System.runAs(operator('guardint')) {
      wdn_Reconciliation_Run__c parent = run();
      wdn_Provisioned_Grant__c row =
        new wdn_Provisioned_Grant__c(wdn_Target_Id__c = 'original');
      insert row;
      row.wdn_Revoked_On__c = System.now();
      denied(Database.update(row, false).getErrors()[0]);
      row.wdn_Revoked_By_Run__c = parent.Id;
      row.wdn_Target_Label__c = 'tamper';
      denied(Database.update(row, false).getErrors()[0]);
      row.wdn_Target_Label__c = null;
      Database.update(row, AccessLevel.USER_MODE);
      wdn_Provisioned_Grant__c revoked = [
        SELECT wdn_Revoked_On__c, wdn_Revoked_By_Run__c
        FROM wdn_Provisioned_Grant__c
        WHERE Id = :row.Id
      ];
      System.assertNotEquals(null, revoked.wdn_Revoked_On__c);
      System.assertEquals(parent.Id, revoked.wdn_Revoked_By_Run__c);
      row.wdn_Revoked_On__c = null;
      denied(Database.update(row, false).getErrors()[0]);
      row.wdn_Revoked_On__c = System.now();
      row.wdn_Revoked_By_Run__c = null;
      denied(Database.update(row, false).getErrors()[0]);
    }
  }
  @IsTest
  static void maintenanceCanCorrectAndPurgeInDependencyOrder() {
    System.runAs(operator('guardmnt')) {
      // The explicit grant exercises the same bypass available to trusted
      // System Administrators after an AdminsOnly installation.
      System.assert(
        FeatureManagement.checkPermission('wdn_Ledger_Maintenance')
      );
      wdn_Reconciliation_Run__c parent = run();
      wdn_Reconciliation_Item__c item =
        new wdn_Reconciliation_Item__c(
          wdn_Reconciliation_Run__c = parent.Id,
          wdn_User_Key__c = 'test'
        );
      insert item;
      wdn_Provisioned_Grant__c row =
        new wdn_Provisioned_Grant__c(
          wdn_Target_Id__c = 'original',
          wdn_Granted_By_Run__c = parent.Id
        );
      insert row;
      row.wdn_Target_Label__c = 'corrected';
      Database.update(row, AccessLevel.USER_MODE);
      System.assert(
        !Database.delete(parent, false).isSuccess(),
        'Restrict lookup still applies'
      );
      Database.delete(row, AccessLevel.USER_MODE);
      Database.delete(parent, AccessLevel.USER_MODE);
      System.assertEquals(
        0,
        [SELECT COUNT() FROM wdn_Reconciliation_Item__c WHERE Id = :item.Id]
      );
      parent = run();
      item =
        new wdn_Reconciliation_Item__c(
          wdn_Reconciliation_Run__c = parent.Id,
          wdn_User_Key__c = 'direct'
        );
      insert item;
      Database.delete(item, AccessLevel.USER_MODE);
    }
  }
}
