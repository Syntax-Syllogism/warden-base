@IsTest
private class wdn_BasePermissionSetsTest {
  private static User operator(String alias, String permission) {
    User user = wdn_TriggerTestUsers.minimalAccessUser(alias);
    insert as system user;
    insert as system new PermissionSetAssignment(
      AssigneeId = user.Id,
      PermissionSetId =
        [SELECT Id FROM PermissionSet WHERE Name = :permission].Id
    );
    return user;
  }

  @IsTest
  static void integrationWritesAuditAndRevokes() {
    User user = operator('wdbint', 'wdn_Integration');
    System.runAs(user) {
      wdn_Persona__c persona =
        new wdn_Persona__c(Name = 'Operator', wdn_Api_Name__c = 'operator');
      insert as system persona;
      wdn_Persona_Assignment__c assignment =
        new wdn_Persona_Assignment__c(
          wdn_User__c = user.Id,
          wdn_Persona__c = persona.Id,
          wdn_Status__c = 'Active'
        );
      insert as system assignment;

      wdn_Reconciliation_Run__c run =
        new wdn_Reconciliation_Run__c(
          wdn_Mode__c = 'Apply',
          wdn_Source_System__c = 'CLI'
        );
      Database.insert(run, AccessLevel.USER_MODE);
      wdn_Reconciliation_Item__c item =
        new wdn_Reconciliation_Item__c(
          wdn_Reconciliation_Run__c = run.Id,
          wdn_User_Key__c = user.Username,
          wdn_Status__c = 'Applied'
        );
      Database.insert(item, AccessLevel.USER_MODE);
      wdn_Provisioned_Grant__c grant =
        new wdn_Provisioned_Grant__c(
          wdn_User__c = user.Id,
          wdn_Persona__c = persona.Id,
          wdn_Persona_Assignment__c = assignment.Id,
          wdn_Target_Id__c = 'target',
          wdn_Type__c = 'Permission Set',
          wdn_Granted_By_Run__c = run.Id
        );
      Database.insert(grant, AccessLevel.USER_MODE);
      wdn_Reconciliation_Item__c savedItem = [
        SELECT wdn_User_Key__c
        FROM wdn_Reconciliation_Item__c
        WHERE Id = :item.Id
        WITH USER_MODE
      ];
      System.assertEquals(user.Username, savedItem.wdn_User_Key__c);
      wdn_Provisioned_Grant__c savedGrant = [
        SELECT wdn_Target_Id__c
        FROM wdn_Provisioned_Grant__c
        WHERE Id = :grant.Id
        WITH USER_MODE
      ];
      System.assertEquals('target', savedGrant.wdn_Target_Id__c);

      Datetime revoked = System.now();
      Database.update(
        new wdn_Provisioned_Grant__c(
          Id = grant.Id,
          wdn_Revoked_On__c = revoked,
          wdn_Revoked_By_Run__c = run.Id
        ),
        AccessLevel.USER_MODE
      );
      Database.update(
        new wdn_Persona_Assignment__c(
          Id = assignment.Id,
          wdn_Status__c = 'Revoked',
          wdn_Revoked_On__c = revoked,
          wdn_Revoked_By__c = user.Id,
          wdn_Revoked_By_Run__c = run.Id
        ),
        AccessLevel.USER_MODE
      );
      savedGrant = [
        SELECT wdn_Revoked_On__c, wdn_Revoked_By_Run__c
        FROM wdn_Provisioned_Grant__c
        WHERE Id = :grant.Id
        WITH USER_MODE
      ];
      System.assertEquals(revoked, savedGrant.wdn_Revoked_On__c);
      System.assertEquals(run.Id, savedGrant.wdn_Revoked_By_Run__c);
      System.assertEquals(
        'Revoked',
        [
          SELECT wdn_Status__c
          FROM wdn_Persona_Assignment__c
          WHERE Id = :assignment.Id
          WITH USER_MODE
        ]
          .wdn_Status__c
      );
    }
  }

  @IsTest
  static void publisherCannotCreateGrants() {
    User user = operator('wdbpub', 'wdn_Persona_Publisher');
    System.runAs(user) {
      Schema.SObjectType grantType =
        Schema.getGlobalDescribe().get('wdn_Provisioned_Grant__c');
      System.assert(
        grantType == null || !grantType.getDescribe().isCreateable()
      );
      if (grantType != null) {
        SObject grant = grantType.newSObject();
        grant.put('wdn_User__c', user.Id);
        grant.put('wdn_Type__c', 'Permission Set');
        grant.put('wdn_Target_Id__c', 'publisher-probe');
        Database.SaveResult result =
          Database.insert(grant, false, AccessLevel.USER_MODE);
        System.assertEquals(false, result.isSuccess());
      }
    }
  }

  @IsTest
  static void viewerReadsButCannotWrite() {
    User user = operator('wdbview', 'wdn_Base_Viewer');
    System.runAs(user) {
      wdn_Persona__c persona =
        new wdn_Persona__c(Name = 'Viewer', wdn_Api_Name__c = 'viewer');
      insert as system persona;
      System.assertEquals(
        1,
        [
          SELECT COUNT()
          FROM wdn_Persona__c
          WHERE Id = :persona.Id
          WITH USER_MODE
        ]
      );
      System.assertEquals(
        0,
        [SELECT COUNT() FROM wdn_Persona_Component__c WITH USER_MODE]
      );
      System.assertEquals(
        0,
        [SELECT COUNT() FROM wdn_Persona_Assignment__c WITH USER_MODE]
      );
      System.assertEquals(
        0,
        [SELECT COUNT() FROM wdn_Provisioned_Grant__c WITH USER_MODE]
      );
      System.assertEquals(
        0,
        [SELECT COUNT() FROM wdn_Reconciliation_Run__c WITH USER_MODE]
      );
      System.assertEquals(
        0,
        [SELECT COUNT() FROM wdn_Reconciliation_Item__c WITH USER_MODE]
      );
      Database.SaveResult inserted =
        Database.insert(
          new wdn_Persona__c(Name = 'Denied', wdn_Api_Name__c = 'denied'),
          false,
          AccessLevel.USER_MODE
        );
      System.assertEquals(false, inserted.isSuccess());
      Database.SaveResult updated =
        Database.update(
          new wdn_Persona__c(Id = persona.Id, Name = 'Denied'),
          false,
          AccessLevel.USER_MODE
        );
      System.assertEquals(false, updated.isSuccess());
      System.assertEquals(
        'Viewer',
        [SELECT Name FROM wdn_Persona__c WHERE Id = :persona.Id WITH USER_MODE]
          .Name
      );
    }
  }

  @IsTest
  static void publisherUpsertsPersonasAndCreatesAndDeletesComponents() {
    User user = operator('wdbpub', 'wdn_Persona_Publisher');
    System.runAs(user) {
      wdn_Persona__c persona =
        new wdn_Persona__c(
          Name = 'Publisher',
          wdn_Api_Name__c = 'publisher',
          wdn_Active__c = true
        );
      Database.upsert(
        persona,
        wdn_Persona__c.Fields.wdn_Api_Name__c,
        AccessLevel.USER_MODE
      );
      wdn_Persona__c replacement =
        new wdn_Persona__c(Name = 'Renamed', wdn_Api_Name__c = 'publisher');
      Database.upsert(
        replacement,
        wdn_Persona__c.Fields.wdn_Api_Name__c,
        AccessLevel.USER_MODE
      );
      System.assertEquals(persona.Id, replacement.Id);
      wdn_Persona__c savedPersona = [
        SELECT Name, wdn_Api_Name__c
        FROM wdn_Persona__c
        WHERE Id = :persona.Id
        WITH USER_MODE
      ];
      System.assertEquals('Renamed', savedPersona.Name);
      System.assertEquals('publisher', savedPersona.wdn_Api_Name__c);
      wdn_Persona_Component__c component =
        new wdn_Persona_Component__c(
          wdn_Persona__c = persona.Id,
          wdn_Type__c = 'Permission Set',
          wdn_Reference__c = 'OldPermission'
        );
      Database.insert(component, AccessLevel.USER_MODE);
      wdn_Persona_Component__c savedComponent = [
        SELECT wdn_Persona__c, wdn_Reference__c
        FROM wdn_Persona_Component__c
        WHERE Id = :component.Id
        WITH USER_MODE
      ];
      System.assertEquals(persona.Id, savedComponent.wdn_Persona__c);
      System.assertEquals('OldPermission', savedComponent.wdn_Reference__c);
      Database.delete(component, AccessLevel.USER_MODE);
      System.assertEquals(
        0,
        [SELECT COUNT() FROM wdn_Persona_Component__c WHERE Id = :component.Id]
      );
    }
  }
}
