@IsTest
private class wdn_AssignmentRegrantTest {
  private static wdn_Persona_Assignment__c assignment(String status) {
    wdn_Persona__c persona =
      new wdn_Persona__c(Name = 'Operator', wdn_Api_Name__c = 'operator');
    insert as system persona;
    wdn_Reconciliation_Run__c run =
      new wdn_Reconciliation_Run__c(wdn_Mode__c = 'Preview');
    insert as system run;
    return new wdn_Persona_Assignment__c(
      wdn_User__c = UserInfo.getUserId(),
      wdn_Persona__c = persona.Id,
      wdn_Status__c = status,
      wdn_Revoked_On__c = System.now(),
      wdn_Revoked_By__c = UserInfo.getUserId(),
      wdn_Revoked_By_Run__c = run.Id
    );
  }

  private static wdn_Persona_Assignment__c stored(Id assignmentId) {
    return [
      SELECT
        wdn_Status__c,
        wdn_Revoked_On__c,
        wdn_Revoked_By__c,
        wdn_Revoked_By_Run__c
      FROM wdn_Persona_Assignment__c
      WHERE Id = :assignmentId
      WITH SYSTEM_MODE
    ];
  }

  @IsTest
  static void reactivationClearsRevocation() {
    User user = wdn_TriggerTestUsers.minimalAccessUser('regrant');
    insert as system user;
    System.runAs(user) {
      wdn_Persona_Assignment__c row = assignment('Revoked');
      insert as system row;
      System.assertNotEquals(null, stored(row.Id).wdn_Revoked_On__c);
      row.wdn_Status__c = 'Active';
      update as system row;
      wdn_Persona_Assignment__c saved = stored(row.Id);
      System.assertEquals(null, saved.wdn_Revoked_On__c);
      System.assertEquals(null, saved.wdn_Revoked_By__c);
      System.assertEquals(null, saved.wdn_Revoked_By_Run__c);
    }
  }

  @IsTest
  static void activeInsertClearsStaleRevocation() {
    User user = wdn_TriggerTestUsers.minimalAccessUser('regrant');
    insert as system user;
    System.runAs(user) {
      wdn_Persona_Assignment__c row = assignment('Active');
      insert as system row;
      wdn_Persona_Assignment__c saved = stored(row.Id);
      System.assertEquals(null, saved.wdn_Revoked_On__c);
      System.assertEquals(null, saved.wdn_Revoked_By__c);
      System.assertEquals(null, saved.wdn_Revoked_By_Run__c);
    }
  }

  @IsTest
  static void activeUpdatePreservesAuditWhenStatusDoesNotChange() {
    User user = wdn_TriggerTestUsers.minimalAccessUser('regrant');
    insert as system user;
    System.runAs(user) {
      wdn_Persona_Assignment__c row = assignment('Active');
      Id revoker = row.wdn_Revoked_By__c;
      Id run = row.wdn_Revoked_By_Run__c;
      insert as system row;
      row.wdn_Revoked_On__c = System.now();
      row.wdn_Revoked_By__c = revoker;
      row.wdn_Revoked_By_Run__c = run;
      update as system row;
      wdn_Persona_Assignment__c saved = stored(row.Id);
      System.assertNotEquals(null, saved.wdn_Revoked_On__c);
      System.assertEquals(revoker, saved.wdn_Revoked_By__c);
      System.assertEquals(run, saved.wdn_Revoked_By_Run__c);
    }
  }

  @IsTest
  static void deactivationPreservesRevocation() {
    User user = wdn_TriggerTestUsers.minimalAccessUser('regrant');
    insert as system user;
    System.runAs(user) {
      wdn_Persona_Assignment__c row = assignment('Active');
      wdn_Persona_Assignment__c audit = row.clone();
      insert as system row;
      row.wdn_Revoked_On__c = audit.wdn_Revoked_On__c;
      row.wdn_Revoked_By__c = audit.wdn_Revoked_By__c;
      row.wdn_Revoked_By_Run__c = audit.wdn_Revoked_By_Run__c;
      update as system row;
      wdn_Persona_Assignment__c beforeUpdate = stored(row.Id);
      row.wdn_Status__c = 'Inactive';
      update as system row;
      wdn_Persona_Assignment__c afterUpdate = stored(row.Id);
      System.assertNotEquals(null, beforeUpdate.wdn_Revoked_On__c);
      System.assertEquals('Inactive', afterUpdate.wdn_Status__c);
      System.assertEquals(
        beforeUpdate.wdn_Revoked_On__c,
        afterUpdate.wdn_Revoked_On__c
      );
      System.assertEquals(
        beforeUpdate.wdn_Revoked_By__c,
        afterUpdate.wdn_Revoked_By__c
      );
      System.assertEquals(
        beforeUpdate.wdn_Revoked_By_Run__c,
        afterUpdate.wdn_Revoked_By_Run__c
      );
    }
  }

  @IsTest
  static void bulkInsertAndReactivationClearRevocation() {
    User user = wdn_TriggerTestUsers.minimalAccessUser('regrant');
    insert as system user;
    System.runAs(user) {
      wdn_Persona_Assignment__c fixture = assignment('Revoked');
      List<wdn_Persona_Assignment__c> rows =
        new List<wdn_Persona_Assignment__c>();
      for (Integer i = 0; i < 200; i++) {
        wdn_Persona_Assignment__c row = fixture.clone();
        if (Math.mod(i, 2) == 0) {
          row.wdn_Status__c = 'Active';
        }
        rows.add(row);
      }
      insert as system rows;
      Set<Id> ids = new Map<Id, wdn_Persona_Assignment__c>(rows).keySet();
      System.assertEquals(
        100,
        [
          SELECT COUNT()
          FROM wdn_Persona_Assignment__c
          WHERE
            Id IN :ids
            AND wdn_Status__c = 'Active'
            AND wdn_Revoked_On__c = NULL
            AND wdn_Revoked_By__c = NULL
            AND wdn_Revoked_By_Run__c = NULL
          WITH SYSTEM_MODE
        ]
      );
      System.assertEquals(
        100,
        [
          SELECT COUNT()
          FROM wdn_Persona_Assignment__c
          WHERE
            Id IN :ids
            AND wdn_Status__c = 'Revoked'
            AND wdn_Revoked_On__c != NULL
            AND wdn_Revoked_By__c != NULL
            AND wdn_Revoked_By_Run__c != NULL
          WITH SYSTEM_MODE
        ]
      );
      List<wdn_Persona_Assignment__c> updates =
        new List<wdn_Persona_Assignment__c>();
      for (wdn_Persona_Assignment__c row : rows) {
        updates.add(
          new wdn_Persona_Assignment__c(Id = row.Id, wdn_Status__c = 'Active')
        );
      }
      update as system updates;
      System.assertEquals(
        200,
        [
          SELECT COUNT()
          FROM wdn_Persona_Assignment__c
          WHERE
            Id IN :ids
            AND wdn_Status__c = 'Active'
            AND wdn_Revoked_On__c = NULL
            AND wdn_Revoked_By__c = NULL
            AND wdn_Revoked_By_Run__c = NULL
          WITH SYSTEM_MODE
        ]
      );
    }
  }
}
