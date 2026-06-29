import request from '~/api/request';
import { unwrap } from '~/utils/api';
import { areaList } from './areaData.js';

Page({
  data: {
    personInfo: {
      name: '',
      gender: 2,
      birth: '',
      address: ['110000', '110100'],
      introduction: '',
      photos: [],
    },
    genderOptions: [
      {
        label: '男',
        value: 0,
      },
      {
        label: '女',
        value: 1,
      },
      {
        label: '保密',
        value: 2,
      },
    ],
    birthVisible: false,
    birthStart: '1970-01-01',
    birthEnd: '2026-12-31',
    birthTime: 0,
    birthFilter: (type, options) => (type === 'year' ? options.sort((a, b) => b.value - a.value) : options),
    addressText: '',
    addressVisible: false,
    provinces: [],
    cities: [],

    gridConfig: {
      column: 3,
      width: 160,
      height: 160,
    },
  },

  onLoad() {
    this.initAreaData();
    this.getPersonalInfo();
  },

  getPersonalInfo() {
    request('/auth/me').then((res) => {
      const user = unwrap(res);
      const profile = user.profile || {};
      const address = profile.address || this.data.personInfo.address;
      this.setData(
        {
          personInfo: {
            name: user.nickname || '',
            gender: profile.gender === undefined ? 2 : profile.gender,
            birth: profile.birth || '',
            address,
            introduction: profile.introduction || '',
            photos: profile.photos || [],
          },
        },
        () => this.updateAddressText(),
      );
    });
  },

  updateAddressText() {
    const { address } = this.data.personInfo;
    this.setData({
      addressText: `${areaList.provinces[address[0]] || ''} ${areaList.cities[address[1]] || ''}`.trim(),
    });
  },

  getAreaOptions(data, filter) {
    const res = Object.keys(data).map((key) => ({ value: key, label: data[key] }));
    return typeof filter === 'function' ? res.filter(filter) : res;
  },

  getCities(provinceValue) {
    return this.getAreaOptions(
      areaList.cities,
      (city) => `${city.value}`.slice(0, 2) === `${provinceValue}`.slice(0, 2),
    );
  },

  initAreaData() {
    const provinces = this.getAreaOptions(areaList.provinces);
    const cities = this.getCities(provinces[0].value);
    this.setData({ provinces, cities });
  },

  onAreaPick(e) {
    const { column, index } = e.detail;
    const { provinces } = this.data;

    if (column === 0) {
      const cities = this.getCities(provinces[index].value);
      this.setData({ cities });
    }
  },

  showPicker(e) {
    const { mode } = e.currentTarget.dataset;
    this.setData({
      [`${mode}Visible`]: true,
    });
    if (mode === 'address') {
      const cities = this.getCities(this.data.personInfo.address[0]);
      this.setData({ cities });
    }
  },

  hidePicker(e) {
    const { mode } = e.currentTarget.dataset;
    this.setData({
      [`${mode}Visible`]: false,
    });
  },

  onPickerChange(e) {
    const { value, label } = e.detail;
    const { mode } = e.currentTarget.dataset;

    this.setData({
      [`personInfo.${mode}`]: value,
    });
    if (mode === 'address') {
      this.setData({
        addressText: label.join(' '),
      });
    }
  },

  personInfoFieldChange(field, e) {
    const { value } = e.detail;
    this.setData({
      [`personInfo.${field}`]: value,
    });
  },

  onNameChange(e) {
    this.personInfoFieldChange('name', e);
  },

  onGenderChange(e) {
    this.personInfoFieldChange('gender', e);
  },

  onIntroductionChange(e) {
    this.personInfoFieldChange('introduction', e);
  },

  onPhotosRemove(e) {
    const { index } = e.detail;
    const photos = this.data.personInfo.photos.slice();

    photos.splice(index, 1);
    this.setData({
      'personInfo.photos': photos,
    });
  },

  onPhotosSuccess(e) {
    const { files } = e.detail;
    this.setData({
      'personInfo.photos': files,
    });
  },

  onPhotosDrop(e) {
    const { files } = e.detail;
    this.setData({
      'personInfo.photos': files,
    });
  },

  onSaveInfo() {
    const { personInfo } = this.data;
    request('/auth/me', 'PUT', {
      nickname: personInfo.name,
      profile: {
        gender: personInfo.gender,
        birth: personInfo.birth,
        address: personInfo.address,
        introduction: personInfo.introduction,
        photos: personInfo.photos,
      },
    })
      .then(() => wx.showToast({ title: '已保存', icon: 'success' }))
      .catch(() => wx.showToast({ title: '保存失败', icon: 'none' }));
  },
});
