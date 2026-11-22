/**
 * Maintains revocation audit fields on active assignments.
 */
public inherited sharing class wdn_AssignmentRegrantHandler {
  /**
   * Clears stale revocation data when an assignment enters the Active state.
   * @param rows Incoming assignments
   * @param oldRows Assignments before update
   * @param operation Before-insert or before-update trigger operation
   */
  public static void clearRevocation(
    List<wdn_Persona_Assignment__c> rows,
    Map<Id, wdn_Persona_Assignment__c> oldRows,
    System.TriggerOperation operation
  ) {
    for (wdn_Persona_Assignment__c row : rows) {
      if (
        row.wdn_Status__c == 'Active'
        && (
          operation == System.TriggerOperation.BEFORE_INSERT
          || oldRows.get(row.Id).wdn_Status__c != 'Active'
        )
      ) {
        row.wdn_Revoked_On__c = null;
        row.wdn_Revoked_By__c = null;
        row.wdn_Revoked_By_Run__c = null;
      }
    }
  }
}
