export const idColumn = 'id'
export const modified = 'modified'
export const deleted = 'deleted_e77d373e_ba37_4e8b_a659_bdaa603d12d9'
export const isNew = 'new_cd727928_b776_4fbc_b078_86f6ff510ab2'
export const modifiedColumns =
  'modified_columns_577189e4_fc23_48ee_bd44_f7d03168a1c2'
export const sentToServer =
  'sent_to_server_24ae5c82_38e6_430a_a310_a0adb89237f5'
export const synced = 'synced_d78ceb7d_c1b6_4f11_92b0_0a12657321b1'
export const backup = 'backup_1230f1a9_4944_467f_b5e0_4ac77966a9d3'

export type LocalChangeable = {
  [idColumn]: string
  [modified]: string
  [synced]?: boolean
  [sentToServer]?: boolean
}
