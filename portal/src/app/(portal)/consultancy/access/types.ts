export interface Colleague {
  id: string;
  full_name: string | null;
  email: string;
}

export interface ConsultancyClientRelationship {
  id: string;
  targetOrganisationId: string;
  targetOrganisationName: string;
}

export interface AccessRole {
  key: string;
  name: string;
}

export interface AccessGrant {
  id: string;
  userId: string;
  userName: string;
  organisationId: string;
  organisationName: string;
  roleKey: string;
  accessScope: string;
  validUntil: string | null;
}
