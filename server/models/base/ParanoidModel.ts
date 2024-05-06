/* eslint-disable @typescript-eslint/ban-types */
import { DeletedAt } from "sequelize-typescript";
import IdModel from "./IdModel";

class ParanoidModel<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TModelAttributes extends {} = any,
  TCreationAttributes extends {} = TModelAttributes
> extends IdModel<TModelAttributes, TCreationAttributes> {
  @DeletedAt
  deletedAt: Date | null;

  /**
   * Whether the model has been deleted.
   *
   * @returns True if the model has been deleted
   */
  get isDeleted() {
    return !!this.deletedAt;
  }
}

export default ParanoidModel;
