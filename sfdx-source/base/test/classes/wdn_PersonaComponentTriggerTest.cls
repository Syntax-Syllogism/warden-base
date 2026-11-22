@IsTest
private class wdn_PersonaComponentTriggerTest {
  @IsTest
  static void locksParentsForBulkComponentChanges() {
    User user = wdn_TriggerTestUsers.minimalAccessUser('wdncomp');
    insert user;
    System.runAs(user) {
      List<wdn_Persona__c> personas =
        new List<wdn_Persona__c>{
          new wdn_Persona__c(Name = 'First', wdn_Api_Name__c = 'first'),
          new wdn_Persona__c(Name = 'Second', wdn_Api_Name__c = 'second')
        };
      insert personas;

      List<wdn_Persona_Component__c> components =
        new List<wdn_Persona_Component__c>();
      for (wdn_Persona__c persona : personas) {
        components.add(
          new wdn_Persona_Component__c(
            wdn_Persona__c = persona.Id,
            wdn_Type__c = 'Permission Set',
            wdn_Reference__c = 'Original'
          )
        );
      }
      insert components;
      for (wdn_Persona_Component__c component : components) {
        component.wdn_Reference__c = 'Changed';
      }
      update components;
      Set<Id> componentIds =
        new Map<Id, wdn_Persona_Component__c>(components).keySet();
      System.assertEquals(
        2,
        [
          SELECT COUNT()
          FROM wdn_Persona_Component__c
          WHERE Id IN :componentIds AND wdn_Reference__c = 'Changed'
        ]
      );

      delete components;
      System.assertEquals(
        0,
        [SELECT COUNT() FROM wdn_Persona_Component__c WHERE Id IN :componentIds]
      );
    }
  }
}
