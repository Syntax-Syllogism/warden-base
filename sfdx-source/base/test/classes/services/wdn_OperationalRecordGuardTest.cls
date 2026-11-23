@IsTest
private class wdn_OperationalRecordGuardTest {
  @TestSetup
  static void users() {
    User integration = wdn_TriggerTestUsers.minimalAccessUser('guardint');
    User maintenance = wdn_TriggerTestUsers.minimalAccessUser('guardmnt');
    List<User> users = new List<User>{ integration, maintenance };
    insert as system users;
    insert as system new List<PermissionSetAssignment>{
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
    insert as system row;
    return row;
  }
  private static wdn_Provisioned_Grant__c grant(String target) {
    return new wdn_Provisioned_Grant__c(
      wdn_User__c = UserInfo.getUserId(),
      wdn_Type__c = 'Permission Set',
      wdn_Target_Id__c = target
    );
  }
  private static void denied(Database.SaveResult result) {
    System.assertEquals(false, result.isSuccess());
    System.assertEquals(
      wdn_OperationalRecordGuard.MESSAGE,
      result.getErrors()[0].getMessage()
    );
  }
  private static void denied(Database.DeleteResult result) {
    System.assertEquals(false, result.isSuccess());
    System.assertEquals(
      wdn_OperationalRecordGuard.MESSAGE,
      result.getErrors()[0].getMessage()
    );
  }
  @IsTest
  static void integrationCannotChangeLedgerOrDeleteRunsAndItems() {
    System.runAs(operator('guardint')) {
      System.assert(
        !FeatureManagement.checkPermission(
          wdn_OperationalRecordGuard.MAINTENANCE_PERMISSION
        ),
        'The integration user must lack Ledger Maintenance'
      );
      wdn_Reconciliation_Run__c parent = run();
      List<wdn_Provisioned_Grant__c> grants =
        new List<wdn_Provisioned_Grant__c>();
      for (Integer i = 0; i < 200; i++) {
        grants.add(grant('original'));
      }
      insert as system grants;
      for (wdn_Provisioned_Grant__c row : grants) {
        row.wdn_Target_Label__c = 'changed';
      }
      for (Database.SaveResult result : Database.update(
        grants,
        false,
        AccessLevel.SYSTEM_MODE
      )) {
        denied(result);
      }
      for (Database.DeleteResult result : Database.delete(
        grants,
        false,
        AccessLevel.SYSTEM_MODE
      )) {
        denied(result);
      }
      wdn_Reconciliation_Item__c item =
        new wdn_Reconciliation_Item__c(
          wdn_Reconciliation_Run__c = parent.Id,
          wdn_User_Key__c = 'test'
        );
      insert as system item;
      denied(Database.delete(item, false, AccessLevel.SYSTEM_MODE));
      denied(Database.delete(parent, false, AccessLevel.SYSTEM_MODE));
      System.assertEquals(
        1,
        [SELECT COUNT() FROM wdn_Reconciliation_Item__c WHERE Id = :item.Id]
      );
      parent.wdn_Applied_Count__c = 1;
      update as system parent;
      item.wdn_Status__c = 'Applied';
      update as system item;
      System.assertEquals(
        1,
        [
          SELECT wdn_Applied_Count__c
          FROM wdn_Reconciliation_Run__c
          WHERE Id = :parent.Id
          WITH SYSTEM_MODE
        ]
          .wdn_Applied_Count__c
      );
      System.assertEquals(
        'Applied',
        [
          SELECT wdn_Status__c
          FROM wdn_Reconciliation_Item__c
          WHERE Id = :item.Id
          WITH SYSTEM_MODE
        ]
          .wdn_Status__c
      );
    }
  }
  @IsTest
  static void protectsStandardAndFutureFields() {
    Id newOwner = operator('guardmnt').Id;
    System.runAs(operator('guardint')) {
      Set<String> protectedFields =
        wdn_OperationalRecordGuard.getProtectedGrantFields();
      System.assert(protectedFields.contains('ownerid'));
      for (Schema.SObjectField field : wdn_Provisioned_Grant__c.SObjectType.getDescribe(
          SObjectDescribeOptions.DEFERRED
        )
        .fields
        .getMap()
        .values()) {
        Schema.DescribeFieldResult details = field.getDescribe();
        String name = details.getName().toLowerCase();
        if (wdn_OperationalRecordGuard.REVOCATION_FIELDS.contains(name)) {
          System.assert(!protectedFields.contains(name), name);
        } else if (details.isUpdateable()) {
          System.assert(protectedFields.contains(name), name);
        }
      }
      wdn_Reconciliation_Run__c parent = run();
      wdn_Provisioned_Grant__c row = grant('standard');
      insert as system row;
      row.wdn_Revoked_On__c = System.now();
      row.wdn_Revoked_By_Run__c = parent.Id;
      row.OwnerId = newOwner;
      denied(Database.update(row, false, AccessLevel.SYSTEM_MODE));
      row.OwnerId = UserInfo.getUserId();
      if (wdn_Provisioned_Grant__c.Name.getDescribe().isUpdateable()) {
        row.put('Name', 'tampered');
        denied(Database.update(row, false, AccessLevel.SYSTEM_MODE));
      }
    }
  }
  @IsTest
  static void mixedBatchFailsOnlyInvalidRows() {
    System.runAs(operator('guardint')) {
      wdn_Reconciliation_Run__c parent = run();
      List<wdn_Provisioned_Grant__c> rows =
        new List<wdn_Provisioned_Grant__c>{ grant('valid'), grant('invalid') };
      insert as system rows;
      for (wdn_Provisioned_Grant__c row : rows) {
        row.wdn_Revoked_On__c = System.now();
        row.wdn_Revoked_By_Run__c = parent.Id;
      }
      rows[1].wdn_Target_Label__c = 'tampered';
      List<Database.SaveResult> results =
        Database.update(rows, false, AccessLevel.SYSTEM_MODE);
      System.assert(results[0].isSuccess());
      denied(results[1]);
      Set<Id> ids = new Map<Id, wdn_Provisioned_Grant__c>(rows).keySet();
      Map<Id, wdn_Provisioned_Grant__c> saved =
        new Map<Id, wdn_Provisioned_Grant__c>(
          [
            SELECT wdn_Revoked_By_Run__c, wdn_Target_Label__c
            FROM wdn_Provisioned_Grant__c
            WHERE Id IN :ids
            WITH SYSTEM_MODE
          ]
        );
      System.assertEquals(
        parent.Id,
        saved.get(rows[0].Id).wdn_Revoked_By_Run__c
      );
      System.assertEquals(null, saved.get(rows[1].Id).wdn_Revoked_By_Run__c);
      System.assertEquals(null, saved.get(rows[1].Id).wdn_Target_Label__c);
    }
  }
  @IsTest
  static void pairedRevocationIsForwardOnlyAndCannotHideOtherEdits() {
    System.runAs(operator('guardint')) {
      wdn_Reconciliation_Run__c parent = run();
      wdn_Provisioned_Grant__c row = grant('original');
      insert as system row;
      row.wdn_Revoked_On__c = System.now();
      denied(Database.update(row, false, AccessLevel.SYSTEM_MODE));
      row.wdn_Revoked_By_Run__c = parent.Id;
      row.wdn_Target_Label__c = 'tamper';
      denied(Database.update(row, false, AccessLevel.SYSTEM_MODE));
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
      denied(Database.update(row, false, AccessLevel.SYSTEM_MODE));
      row.wdn_Revoked_On__c = System.now();
      row.wdn_Revoked_By_Run__c = null;
      denied(Database.update(row, false, AccessLevel.SYSTEM_MODE));
    }
  }
  @IsTest
  static void maintenanceCanCorrectAndPurgeInDependencyOrder() {
    System.runAs(operator('guardmnt')) {
      // The explicit grant exercises the same bypass available to trusted
      // System Administrators after an AdminsOnly installation.
      System.assert(
        FeatureManagement.checkPermission(
          wdn_OperationalRecordGuard.MAINTENANCE_PERMISSION
        )
      );
      wdn_Reconciliation_Run__c parent = run();
      wdn_Reconciliation_Item__c item =
        new wdn_Reconciliation_Item__c(
          wdn_Reconciliation_Run__c = parent.Id,
          wdn_User_Key__c = 'test'
        );
      insert as system item;
      wdn_Provisioned_Grant__c row = grant('original');
      row.wdn_Granted_By_Run__c = parent.Id;
      insert as system row;
      row.wdn_Target_Label__c = 'corrected';
      Database.update(row, AccessLevel.USER_MODE);
      System.assertEquals(
        'corrected',
        [
          SELECT wdn_Target_Label__c
          FROM wdn_Provisioned_Grant__c
          WHERE Id = :row.Id
          WITH SYSTEM_MODE
        ]
          .wdn_Target_Label__c
      );
      System.assert(
        !Database.delete(parent, false, AccessLevel.SYSTEM_MODE).isSuccess(),
        'Restrict lookup still applies'
      );
      Database.delete(row, AccessLevel.USER_MODE);
      Database.delete(parent, AccessLevel.USER_MODE);
      System.assertEquals(
        0,
        [
          SELECT COUNT()
          FROM wdn_Provisioned_Grant__c
          WHERE Id = :row.Id
          WITH SYSTEM_MODE
        ]
      );
      System.assertEquals(
        0,
        [
          SELECT COUNT()
          FROM wdn_Reconciliation_Run__c
          WHERE Id = :parent.Id
          WITH SYSTEM_MODE
        ]
      );
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
      insert as system item;
      Database.delete(item, AccessLevel.USER_MODE);
      System.assertEquals(
        0,
        [
          SELECT COUNT()
          FROM wdn_Reconciliation_Item__c
          WHERE Id = :item.Id
          WITH SYSTEM_MODE
        ]
      );
    }
  }
}
