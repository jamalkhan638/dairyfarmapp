import { addAnimal, type AnimalForm, validateAnimalForm, loadAnimals } from './animals';
import type { AnimalFormValue } from '../components/AnimalForm';
import { local, newId } from '../lib/db';
import { keepPhoto } from '../lib/photos';
import i18n from '../lib/i18n';

/** Quick check on the phone; the server checks again (e.g. two phones, same tag). */
async function tagInUse(tag: string, selfId?: string) {
  const all = await loadAnimals(local().repo);
  return all.some((a) => a.animal.tag.trim().toLowerCase() === tag.trim().toLowerCase() && a.animal.id !== selfId);
}

async function savePhoto(userId: string, animalId: string, v: AnimalFormValue) {
  const { repo, engine } = local();
  if (v.newPhoto) {
    const attId = newId();
    const file = keepPhoto(v.newPhoto.uri, attId);
    await repo.create('Attachment', userId, attId, { entity: 'Animal', recordId: animalId, contentType: 'image/jpeg', sizeBytes: Math.max(1, file.size ?? v.newPhoto.size) });
    await engine.queueUpload(userId, attId, file.uri, 'image/jpeg');
    await repo.update('Animal', userId, animalId, { photoId: attId });
  } else if (v.removePhoto) {
    await repo.update('Animal', userId, animalId, { photoId: null });
  }
}

export async function saveNewAnimal(userId: string, v: AnimalFormValue): Promise<{ id?: string; error?: string }> {
  const err = validateAnimalForm(v.form);
  if (err) return { error: i18n.t(err as any, { defaultValue: err }) };
  if (await tagInUse(v.form.tag)) return { error: i18n.t('tagTaken') };
  const id = await addAnimal(local().repo, userId, newId, v.form, v.initial!);
  await savePhoto(userId, id, v);
  return { id };
}

export async function saveAnimalEdits(userId: string, id: string, v: AnimalFormValue): Promise<{ error?: string }> {
  const err = validateAnimalForm(v.form);
  if (err) return { error: i18n.t(err as any, { defaultValue: err }) };
  if (await tagInUse(v.form.tag, id)) return { error: i18n.t('tagTaken') };
  const f: AnimalForm = { ...v.form, tag: v.form.tag.trim() };
  await local().repo.update('Animal', userId, id, {
    tag: f.tag, name: f.name ?? null, breed: f.breed ?? null, sex: f.sex, birthDate: f.birthDate ?? null,
    birthDateEstimated: f.birthDateEstimated, purchaseDate: f.purchaseDate ?? null, purchasePricePaisa: f.purchasePricePaisa ?? null, notes: f.notes ?? null,
  });
  await savePhoto(userId, id, v);
  return {};
}
