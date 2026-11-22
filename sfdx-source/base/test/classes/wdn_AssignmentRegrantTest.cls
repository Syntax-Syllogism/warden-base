@IsTest
private class wdn_AssignmentRegrantTest {
  private static wdn_Persona_Assignment__c assignment(String status) {
    wdn_Persona__c persona =
      new wdn_Persona__c(Name = 'Operator', wdn_Api_Name__c = 'operator');
    insert persona;
    wdn_Reconciliation_Run__c run =
      new wdn_Reconciliation_Run__c(wdn_Mode__c = 'Preview');
    insert run;
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
      SELECT wdn_Revoked_On__c, wdn_Revoked_By__c, wdn_Revoked_By_Run__c
      FROM wdn_Persona_Assignment__c
      WHERE Id = :assignmentId
    ];
  }

  @IsTest
  static void reactivationClearsRevocation() {
    User user = wdn_TriggerTestUsers.minimalAccessUser('regrant');
    insert user;
    System.runAs(user) {
      wdn_Persona_Assignment__c row = assignment('Revoked');
      insert row;
      System.assertNotEquals(null, stored(row.Id).wdn_Revoked_On__c);
      row.wdn_Status__c = 'Active';
      update row;
      wdn_Persona_Assignment__c saved = stored(row.Id);
      System.assertEquals(null, saved.wdn_Revoked_On__c);
      System.assertEquals(null, saved.wdn_Revoked_By__c);
      System.assertEquals(null, saved.wdn_Revoked_By_Run__c);
    }
  }

  @IsTest
  static void activeInsertClearsStaleRevocation() {
    User user = wdn_TriggerTestUsers.minimalAccessUser('regrant');
    insert user;
    System.runAs(user) {
      wdn_Persona_Assignment__c row = assignment('Active');
      insert row;
      wdn_Persona_Assignment__c saved = stored(row.Id);
      System.assertEquals(null, saved.wdn_Revoked_On__c);
      System.assertEquals(null, saved.wdn_Revoked_By__c);
      System.assertEquals(null, saved.wdn_Revoked_By_Run__c);
    }
  }

  @IsTest
  static void activeUpdatePreservesAuditWhenStatusDoesNotChange() {
    User user = wdn_TriggerTestUsers.minimalAccessUser('regrant');
    insert user;
    System.runAs(user) {
      wdn_Persona_Assignment__c row = assignment('Active');
      Id revoker = row.wdn_Revoked_By__c;
      Id run = row.wdn_Revoked_By_Run__c;
      insert row;
      row.wdn_Revoked_On__c = System.now();
      row.wdn_Revoked_By__c = revoker;
      row.wdn_Revoked_By_Run__c = run;
      update row;
      wdn_Persona_Assignment__c saved = stored(row.Id);
      System.assertNotEquals(null, saved.wdn_Revoked_On__c);
      System.assertEquals(revoker, saved.wdn_Revoked_By__c);
      System.assertEquals(run, saved.wdn_Revoked_By_Run__c);
    }
  }

  @IsTest
  static void inactiveUpdatePreservesRevocation() {
    User user = wdn_TriggerTestUsers.minimalAccessUser('regrant');
    insert user;
    System.runAs(user) {
      wdn_Persona_Assignment__c row = assignment('Inactive');
      insert row;
      wdn_Persona_Assignment__c beforeUpdate = stored(row.Id);
      update row;
      wdn_Persona_Assignment__c afterUpdate = stored(row.Id);
      System.assertNotEquals(null, beforeUpdate.wdn_Revoked_On__c);
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
}
