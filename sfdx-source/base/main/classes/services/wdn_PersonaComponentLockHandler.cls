/**
 * Serializes changes to components that belong to the same persona.
 */
public without sharing class wdn_PersonaComponentLockHandler {
  /**
   * Locks the parent personas for a batch of component changes.
   * @param components Incoming components, or the old records on delete
   */
  public static void lockParents(List<wdn_Persona_Component__c> components) {
    Set<Id> parents = new Set<Id>();
    for (wdn_Persona_Component__c component : components) {
      parents.add(component.wdn_Persona__c);
    }
    // Every component write must lock its parent regardless of caller access.
    Database.query(
      'SELECT Id FROM wdn_Persona__c WHERE Id IN :parents FOR UPDATE',
      AccessLevel.SYSTEM_MODE
    );
  }
}
