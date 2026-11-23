@IsTest
private class wdn_PersonaComponentTriggerTest {
  @IsTest
  static void locksParentsForBulkComponentChanges() {
    User user = wdn_TriggerTestUsers.minimalAccessUser('wdncomp');
    insert as system user;
    System.runAs(user) {
      List<wdn_Persona__c> personas =
        new List<wdn_Persona__c>{
          new wdn_Persona__c(Name = 'First', wdn_Api_Name__c = 'first'),
          new wdn_Persona__c(Name = 'Second', wdn_Api_Name__c = 'second'),
          new wdn_Persona__c(Name = 'Third', wdn_Api_Name__c = 'third')
        };
      insert as system personas;

      List<wdn_Persona_Component__c> components =
        new List<wdn_Persona_Component__c>();
      for (Integer i = 0; i < 200; i++) {
        components.add(
          new wdn_Persona_Component__c(
            wdn_Persona__c = personas[Math.mod(i, personas.size())].Id,
            wdn_Type__c = 'Permission Set',
            wdn_Reference__c = 'Original'
          )
        );
      }
      // Subscriber triggers on this object add their own queries to the DML
      // transaction, so measure the lock handler on its own: one locking query
      // for the three parents, however many components the batch holds.
      Integer queries = Limits.getQueries();
      Integer queryRows = Limits.getQueryRows();
      wdn_PersonaComponentLockHandler.lockParents(components);
      System.assertEquals(1, Limits.getQueries() - queries);
      System.assertEquals(3, Limits.getQueryRows() - queryRows);

      insert as system components;
      for (wdn_Persona_Component__c component : components) {
        component.wdn_Reference__c = 'Changed';
      }
      update as system components;
      Set<Id> componentIds =
        new Map<Id, wdn_Persona_Component__c>(components).keySet();
      System.assertEquals(
        200,
        [
          SELECT COUNT()
          FROM wdn_Persona_Component__c
          WHERE Id IN :componentIds AND wdn_Reference__c = 'Changed'
          WITH SYSTEM_MODE
        ]
      );
      delete as system components;
      System.assertEquals(
        0,
        [
          SELECT COUNT()
          FROM wdn_Persona_Component__c
          WHERE Id IN :componentIds
          WITH SYSTEM_MODE
        ]
      );
    }
  }
}
